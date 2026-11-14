-- Retail / concession point-of-sale: track non-court sales — bottled water, food, merch — that a
-- venue rings up at the desk, independent of any court booking. Opt-in per venue via the `store`
-- capability (venues.features), and fully additive: a venue that sells nothing has an empty catalog
-- and ₱0 retail, so nothing else changes.
--
-- A sale is a receipt (product_sales) with one or more line items (product_sale_items). Unlike
-- equipment (an hourly add-on reserved against stock on a booking), a product is a flat-priced item
-- sold on the spot, so there's no time range and no reservation — just the catalog and the receipts.
-- A sale is realized the moment it's rung up (cash in hand, or already paid online).

-- Per-venue catalog of sellable items (mirrors `equipment`, minus the hourly/stock machinery).
create table products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  category text,                                   -- optional grouping label, e.g. 'Drinks' / 'Food'
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index products_venue_active_idx on products (venue_id) where is_active;

-- A completed counter sale. payment_method mirrors a booking's (cash / online); payment_remarks holds
-- the bank & reference for an online sale, like a booking's payment_remarks. booking_id optionally
-- links a sale rung up alongside a walk-in, but is never required.
create table product_sales (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  sold_at timestamptz not null default now(),
  sold_by uuid references profiles (id),
  payment_method text not null check (payment_method in ('cash', 'online')),
  payment_remarks text,
  total_cents integer not null check (total_cents >= 0),
  note text,
  booking_id uuid references bookings (id) on delete set null,
  created_at timestamptz not null default now()
);
create index product_sales_venue_time_idx on product_sales (venue_id, sold_at);

-- Line items on a sale. name/price are snapshotted so later catalog edits never rewrite past
-- receipts; product_id is kept (nullable) only to group "top sellers" and survives a product delete.
create table product_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references product_sales (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);
create index product_sale_items_sale_idx on product_sale_items (sale_id);

alter table products enable row level security;
alter table product_sales enable row level security;
alter table product_sale_items enable row level security;

-- Catalog: admins manage it; any staff (incl. front desk) can read the active items to ring up a sale.
create policy products_admin_all on products
  for all using (can_admin_venue(venue_id)) with check (can_admin_venue(venue_id));
create policy products_staff_read on products
  for select using (can_staff_venue(venue_id));

-- Sales + their items: any staff of the venue can record, read, and void (delete) them — the front
-- desk is where they're rung up. Inserts go through create_product_sale (below) for atomic,
-- server-priced receipts; this policy also covers reads and the void (delete).
create policy product_sales_staff_all on product_sales
  for all using (can_staff_venue(venue_id)) with check (can_staff_venue(venue_id));
create policy product_sale_items_staff_all on product_sale_items
  for all using (
    exists (select 1 from product_sales s where s.id = sale_id and can_staff_venue(s.venue_id))
  ) with check (
    exists (select 1 from product_sales s where s.id = sale_id and can_staff_venue(s.venue_id))
  );

-- Record a retail sale atomically. p_items is [{product_id, quantity}]; each item is priced from the
-- catalog on the server (never trusting a client-sent price), snapshotted onto a line, and summed into
-- the receipt total. p_sold_at backdates a retroactive sale (NULL = now). Runs as the caller's staff
-- identity. SECURITY DEFINER bypasses RLS, so staff membership is checked explicitly up front.
create or replace function create_product_sale(
  p_venue uuid,
  p_payment_method text,
  p_items jsonb,
  p_payment_remarks text default null,
  p_note text default null,
  p_booking_id uuid default null,
  p_sold_at timestamptz default null
)
returns product_sales
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sale     product_sales;
  v_item     jsonb;
  v_product  products;
  v_qty      integer;
  v_pid      uuid;
  v_name     text;
  v_price    integer;
  v_total    integer := 0;
begin
  if not can_staff_venue(p_venue) then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  if p_payment_method not in ('cash', 'online') then
    raise exception 'BAD_METHOD' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS' using errcode = 'P0001';
  end if;
  -- A backdated sale must be in the past; reject a future timestamp (small clock skew allowed).
  if p_sold_at is not null and p_sold_at > now() + interval '5 minutes' then
    raise exception 'FUTURE_SALE' using errcode = 'P0001';
  end if;

  insert into product_sales (venue_id, sold_at, sold_by, payment_method, payment_remarks, total_cents, note, booking_id)
    values (p_venue, coalesce(p_sold_at, now()), auth.uid(), p_payment_method, nullif(btrim(p_payment_remarks), ''), 0,
            nullif(btrim(p_note), ''), p_booking_id)
    returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    if nullif(v_item ->> 'product_id', '') is not null then
      -- Catalog item: price from the catalog (never trusting a client price); the stock trigger
      -- enforces availability and decrements the count.
      select * into v_product from products
        where id = (v_item ->> 'product_id')::uuid and venue_id = p_venue and is_active;
      if not found then
        raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
      end if;
      v_pid := v_product.id;
      v_name := v_product.name;
      v_price := v_product.price_cents;
    else
      -- Ad-hoc item: a one-off line not in the catalog (name + price supplied), e.g. logging a sale of
      -- something the venue doesn't stock. No product_id, so the stock trigger leaves it alone.
      v_pid := null;
      v_name := nullif(btrim(v_item ->> 'name'), '');
      v_price := (v_item ->> 'unit_price_cents')::integer;
      if v_name is null then
        raise exception 'ITEM_NAME_REQUIRED' using errcode = 'P0001';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'BAD_PRICE' using errcode = 'P0001';
      end if;
    end if;

    insert into product_sale_items (sale_id, product_id, name_snapshot, unit_price_cents, quantity, line_total_cents)
      values (v_sale.id, v_pid, v_name, v_price, v_qty, v_price * v_qty);
    v_total := v_total + v_price * v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'NO_ITEMS' using errcode = 'P0001';
  end if;

  update product_sales set total_cents = v_total where id = v_sale.id returning * into v_sale;
  return v_sale;
end;
$function$;

revoke all on function create_product_sale(uuid, text, jsonb, text, text, uuid, timestamptz) from public;
grant execute on function create_product_sale(uuid, text, jsonb, text, text, uuid, timestamptz) to authenticated, service_role;
