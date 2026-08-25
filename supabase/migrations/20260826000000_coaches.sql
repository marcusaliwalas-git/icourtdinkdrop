-- Coaches: an admin-managed roster shown on the public site, bookable as a standalone request
-- and attachable as a paid add-on to a court booking.

-- ── Coaches roster ────────────────────────────────────────────────────────────
create table coaches (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null,
  bio text,                                   -- the "coach profile" blurb
  photo_url text,
  hourly_rate_cents integer not null default 0 check (hourly_rate_cents >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger coaches_set_updated_at
  before update on coaches
  for each row execute function set_updated_at();

alter table coaches enable row level security;

-- Anyone can see active coaches (the public /coaches page); admins see all (incl. hidden ones).
create policy coaches_public_select on coaches
  for select using (is_active or is_admin());
create policy coaches_admin_all on coaches
  for all using (is_admin()) with check (is_admin());

-- ── Coach photos: a public storage bucket ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-photos', 'coach-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Public bucket → readable by anyone via the public URL. Only admins may write.
create policy coach_photos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'coach-photos' and is_admin())
  with check (bucket_id = 'coach-photos' and is_admin());

-- ── Standalone "request a coach" ──────────────────────────────────────────────
create table coach_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id) on delete cascade,
  profile_id uuid references profiles (id),
  guest_name text,
  guest_phone text,
  guest_email text,
  preferred_at timestamptz,
  message text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  check (profile_id is not null or guest_name is not null)
);

create index coach_requests_coach_id_idx on coach_requests (coach_id);

alter table coach_requests enable row level security;

-- Anyone may submit a request (like a contact form); only admins read/manage them.
create policy coach_requests_insert on coach_requests
  for insert to anon, authenticated with check (true);
create policy coach_requests_admin_select on coach_requests
  for select using (is_admin());
create policy coach_requests_admin_update on coach_requests
  for update using (is_admin()) with check (is_admin());

-- ── Coaching add-on on court bookings ─────────────────────────────────────────
alter table bookings
  add column coach_id uuid references coaches (id),
  add column coach_fee_cents integer not null default 0 check (coach_fee_cents >= 0);

-- ── create_bookings: add an optional coach for the whole cart ──────────────────
-- Adding a parameter changes the signature, so drop the old one first (create-or-replace only
-- replaces an exact match and would otherwise leave an ambiguous overload).
drop function if exists create_bookings(
  jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text
);

create or replace function create_bookings(
  p_segments          jsonb,
  p_party_size        integer default 1,
  p_booked_by         uuid    default null,
  p_guest_name        text    default null,
  p_guest_phone       text    default null,
  p_guest_email       text    default null,
  p_source            text    default 'online',
  p_notes             text    default null,
  p_idempotency_key   text    default null,
  p_player_names      text[]  default '{}',
  p_payment_reference text    default null,
  p_payment_slip_path text    default null,
  p_coach_id          uuid    default null
)
returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seg           jsonb;
  v_index         integer := 0;
  v_booking       bookings;
  v_ids           uuid[] := '{}';
  v_total_minutes integer := 0;
  v_coach         coaches;
  v_coach_fee     integer;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    raise exception 'NO_SEGMENTS' using errcode = 'P0001';
  end if;

  for v_seg in select * from jsonb_array_elements(p_segments)
  loop
    v_booking := create_booking(
      p_court_id          => (v_seg ->> 'court_id')::uuid,
      p_starts_at         => (v_seg ->> 'starts_at')::timestamptz,
      p_duration_minutes  => (v_seg ->> 'duration_minutes')::integer,
      p_party_size        => p_party_size,
      p_booked_by         => p_booked_by,
      p_guest_name        => p_guest_name,
      p_guest_phone       => p_guest_phone,
      p_guest_email       => p_guest_email,
      p_source            => p_source,
      p_notes             => p_notes,
      p_idempotency_key   => case when p_idempotency_key is null then null else p_idempotency_key || '-' || v_index end,
      p_player_names      => p_player_names,
      p_payment_reference => p_payment_reference,
      p_payment_slip_path => p_payment_slip_path
    );
    v_ids := v_ids || v_booking.id;
    v_total_minutes := v_total_minutes + (v_seg ->> 'duration_minutes')::integer;
    v_index := v_index + 1;
  end loop;

  -- Optional coaching add-on: one coach for the whole cart, charged per hour across all slots.
  if p_coach_id is not null then
    select * into v_coach from coaches where id = p_coach_id and is_active;
    if not found then
      raise exception 'COACH_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_coach_fee := round(v_coach.hourly_rate_cents * v_total_minutes / 60.0);
    -- Tag every booking in the cart with the coach (so each slot shows it); record the fee on
    -- the first booking and fold it into that row's total, so realized revenue includes coaching.
    update bookings set coach_id = p_coach_id where id = any (v_ids);
    update bookings
      set coach_fee_cents = v_coach_fee, total_cents = total_cents + v_coach_fee
      where id = v_ids[1];
  end if;

  return query select * from bookings where id = any (v_ids) order by array_position(v_ids, id);
end;
$$;

grant execute on function create_bookings(
  jsonb, integer, uuid, text, text, text, text, text, text, text[], text, text, uuid
) to anon, authenticated;
