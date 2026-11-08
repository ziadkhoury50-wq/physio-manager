-- Assessments belong to individual visits. Do not copy patient-level notes into past visits.
alter table public.sessions
  add column if not exists assessment text not null default '' check (length(assessment) <= 10000),
  add column if not exists pain_management text not null default '' check (length(pain_management) <= 10000);
notify pgrst, 'reload schema';
