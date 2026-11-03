-- Existing sessions intentionally have no recorded amount, rather than a zero fee.
alter table public.sessions add column if not exists amount_cents integer;
alter table public.sessions drop constraint if exists sessions_amount_cents_check;
alter table public.sessions add constraint sessions_amount_cents_check
  check (amount_cents is null or amount_cents between 0 and 100000000);
