-- Record promotion discounts on a freshly-created cart. The discount amounts are computed by the TS
-- promo engine (src/lib/promos) from the cart's authoritative base totals and passed in here; this
-- function only validates and records them, atomically. See docs/promotions-design.md §6–§7.
--
-- Guardrails against a tampered call (the online path runs as anon):
--   * each discount is tied to a real, active promotion for the booking's venue;
--   * a discount can't exceed its booking's total (never a negative price);
--   * the cart's total discount can't exceed venues.max_discount_pct of its base (when set);
--   * a booking that already has a promotion is left alone (idempotent re-submits).
-- Online carts are also admin-reviewed before confirmation, so this is defence-in-depth.

create or replace function apply_group_promotions(p_group_id uuid, p_discounts jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_d        jsonb;
  v_booking  bookings;
  v_promo    promotions;
  v_venue    uuid;
  v_base_sum integer;
  v_disc_sum integer := 0;
  v_max_pct  integer;
  v_cents    integer;
begin
  if p_discounts is null or jsonb_typeof(p_discounts) <> 'array' or jsonb_array_length(p_discounts) = 0 then
    return;
  end if;

  select court_venue(b.court_id) into v_venue from bookings b where b.booking_group_id = p_group_id limit 1;
  if v_venue is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(sum(total_cents), 0) into v_base_sum from bookings where booking_group_id = p_group_id;
  select max_discount_pct into v_max_pct from venues where id = v_venue;

  for v_d in select * from jsonb_array_elements(p_discounts)
  loop
    v_cents := (v_d ->> 'cents')::integer;
    if v_cents is null or v_cents <= 0 then
      continue;
    end if;

    select * into v_booking from bookings
      where id = (v_d ->> 'booking_id')::uuid and booking_group_id = p_group_id
      for update;
    if not found or v_booking.promotion_id is not null then
      continue; -- not part of this cart, or already discounted
    end if;

    select * into v_promo from promotions
      where id = (v_d ->> 'promotion_id')::uuid and venue_id = v_venue and active;
    if not found then
      raise exception 'PROMO_INVALID' using errcode = 'P0001';
    end if;

    v_cents := least(v_cents, v_booking.total_cents); -- never below zero
    update bookings
      set discount_cents = v_cents,
          discount_label = coalesce(nullif(v_d ->> 'label', ''), v_promo.name),
          promotion_id   = v_promo.id,
          total_cents    = total_cents - v_cents
      where id = v_booking.id;
    v_disc_sum := v_disc_sum + v_cents;
  end loop;

  if v_max_pct is not null and v_disc_sum > round(v_base_sum * v_max_pct / 100.0) then
    raise exception 'DISCOUNT_EXCEEDS_CAP' using errcode = 'P0001';
  end if;
end;
$function$;

revoke all on function apply_group_promotions(uuid, jsonb) from public;
grant execute on function apply_group_promotions(uuid, jsonb) to anon, authenticated, service_role;
