-- Doctor-owned reusable templates; patient answers retain their own question snapshot.
begin;
create table public.intake_templates (
  owner_id uuid primary key references auth.users(id),
  tabs jsonb not null default '[]'::jsonb check (jsonb_typeof(tabs) = 'array' and octet_length(tabs::text) <= 40000),
  updated_at timestamptz not null default now()
);
alter table public.intake_templates enable row level security;
create policy doctor_intake_templates on public.intake_templates for all to authenticated
  using ((select public.is_doctor()) and owner_id = (select auth.uid()))
  with check ((select public.is_doctor()) and owner_id = (select auth.uid()));
revoke all on public.intake_templates from public, anon, authenticated;
grant select, insert, update, delete on public.intake_templates to authenticated;
grant all on public.intake_templates to service_role;
create trigger intake_templates_updated before update on public.intake_templates
  for each row execute function public.touch_updated_at();
alter table public.patients add column intake jsonb not null default '{"tabs":[],"answers":{},"summary":""}'::jsonb
  check (jsonb_typeof(intake) = 'object' and octet_length(intake::text) <= 70000);
notify pgrst, 'reload schema';
commit;
