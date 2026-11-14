-- Per-venue court guidelines / etiquette (house rules), shown to a customer on their confirmed
-- booking — in the confirmation email and on the My bookings screen. One rule per line; optional
-- (an empty value shows nothing). Editable by a venue admin in Admin → Venue & Courts → Details;
-- the existing venues UPDATE policy (is_admin_of(id)) already governs who can write it.
alter table venues add column guidelines text;
