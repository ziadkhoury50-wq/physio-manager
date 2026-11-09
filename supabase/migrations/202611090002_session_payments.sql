-- Historical amounts are unconfirmed, not assumed paid or unpaid.
alter table public.sessions add column if not exists payment_received boolean;
alter table public.sessions drop constraint if exists sessions_payment_received_check;
alter table public.sessions add constraint sessions_payment_received_check check (
  payment_received is null or (amount_cents is not null and amount_cents > 0)
);
notify pgrst, 'reload schema';
