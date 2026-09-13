-- Optional QR image (GCash/Maya/bank QR) per payment account, shown in the booking's
-- "Send payment to" panel so customers can scan instead of copying the number.
alter table payment_accounts add column qr_url text;
