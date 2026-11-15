-- Keep patient imaging findings and session-specific MSK ultrasound notes with their records.
alter table public.patients
  add column if not exists imaging_findings text not null default '' check (length(imaging_findings) <= 10000);

alter table public.sessions
  add column if not exists msk_ultrasound text not null default '' check (length(msk_ultrasound) <= 10000);

notify pgrst, 'reload schema';
