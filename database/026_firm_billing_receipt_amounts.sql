-- Billing register: track how much of a bill has been received and what is still
-- pending. Amount Received and Pending Amount sit after Receiving Date.
--   * Receipt Status "Received"/"Realised"  -> received = full total, pending = 0
--   * Receipt Status "Pending" (or blank)    -> received = 0, pending = full total
--   * Any other status (e.g. "Part Received") -> received is entered by hand and
--     pending is calculated as total - received.
-- These are stored so a manually entered part-received amount persists; when the
-- status is Received or Pending the app fills them automatically.

alter table public.firm_billing_records
  add column if not exists amount_received numeric not null default 0,
  add column if not exists pending_amount numeric not null default 0;
