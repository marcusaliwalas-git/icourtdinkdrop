-- Retail inventory, three modes per product (see docs / Store design):
--   • Don't track (default): track_stock=false — always sellable (made-to-order food, anything uncounted).
--   • Count stock: track_stock=true + stock — decrements per sale, blocks overselling, auto-sold-out at 0
--     (bottled drinks, packaged goods, or a daily prepared batch the venue sets each morning).
--   • Sold out ("86"): available=false — a manual switch on ANY product, independent of counting, for
--     when the kitchen runs out. Flipped back on when it's available again.
-- All additive: existing products default to not-tracked and available, so nothing changes for them.

alter table products
  add column track_stock boolean not null default false,
  add column stock integer check (stock is null or stock >= 0),
  add column available boolean not null default true;

-- Enforce availability + stock on each sale line as it's recorded, and keep the count in step. Runs
-- inside create_product_sale's transaction; the row lock serialises concurrent sales of the same item
-- so a tracked product can't be oversold.
create or replace function product_sale_item_apply_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_p products;
begin
  -- Ad-hoc line (no catalog product): nothing to check or decrement.
  if new.product_id is null then
    return new;
  end if;
  select * into v_p from products where id = new.product_id for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_p.available then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_p.track_stock then
    if coalesce(v_p.stock, 0) < new.quantity then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;
    update products set stock = stock - new.quantity where id = v_p.id;
  end if;
  return new;
end $$;

create trigger product_sale_item_stock_before_insert
  before insert on product_sale_items
  for each row execute function product_sale_item_apply_stock();

-- Voiding a sale (which cascade-deletes its lines) returns the units to stock for tracked products.
create or replace function product_sale_item_restore_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.product_id is not null then
    update products set stock = coalesce(stock, 0) + old.quantity
      where id = old.product_id and track_stock;
  end if;
  return old;
end $$;

create trigger product_sale_item_stock_after_delete
  after delete on product_sale_items
  for each row execute function product_sale_item_restore_stock();

-- Flip a product's sold-out switch. Staff (front desk) need this to "86" an item mid-shift without
-- catalog access, so it's its own SECURITY DEFINER RPC gated on staff membership — the stock count and
-- the rest of the catalog stay admin-only through RLS.
create or replace function set_product_availability(p_product uuid, p_available boolean)
returns products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p products;
begin
  select * into v_p from products where id = p_product;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not can_staff_venue(v_p.venue_id) then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  update products set available = p_available where id = p_product returning * into v_p;
  return v_p;
end;
$function$;

revoke all on function set_product_availability(uuid, boolean) from public;
grant execute on function set_product_availability(uuid, boolean) to authenticated, service_role;
