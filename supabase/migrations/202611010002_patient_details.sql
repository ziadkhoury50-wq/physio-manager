-- Add the new fields without deleting historical patient email values.
alter table public.patients
  add column if not exists referred_by text not null default '' check (length(referred_by) <= 300),
  add column if not exists underlying_conditions text not null default '' check (length(underlying_conditions) <= 10000),
  add column if not exists medication text not null default '' check (length(medication) <= 10000);

notify pgrst, 'reload schema';
