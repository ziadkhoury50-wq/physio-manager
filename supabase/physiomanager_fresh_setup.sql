-- PhysioManager: complete schema for a NEW, EMPTY Supabase project.
-- Run once in SQL Editor. No patient records, credentials or doctor accounts are included.
-- Then create the doctor Auth user and configure public.app_access (see README).

-- Source: 202611010001_workspace.sql
-- Apply once in Supabase SQL Editor, then configure app_access as described in README.md.
create table public.app_access (
  singleton boolean primary key default true check (singleton),
  doctor_user_id uuid not null unique references auth.users(id)
);
alter table public.app_access enable row level security;
revoke all on public.app_access from anon, authenticated;
grant select, insert, update, delete on public.app_access to service_role;

create or replace function public.is_doctor()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_access where doctor_user_id = (select auth.uid())); $$;
revoke all on function public.is_doctor() from public;
grant execute on function public.is_doctor() to authenticated;

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 160),
  phone text not null default '' check (length(phone) <= 50),
  email text not null default '' check (length(email) <= 254),
  date_of_birth date,
  condition text not null default '' check (length(condition) <= 300),
  history text not null default '' check (length(history) <= 10000),
  goals text not null default '' check (length(goals) <= 10000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index patients_owner_name on public.patients(owner_id, name);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  patient_id uuid not null,
  session_date date not null,
  symptoms text not null default '' check (length(symptoms) <= 10000),
  pain_score smallint check (pain_score between 0 and 10),
  treatment text not null check (length(trim(treatment)) between 1 and 10000),
  progress text not null default '' check (length(progress) <= 10000),
  plan text not null default '' check (length(plan) <= 10000),
  calendar_id text,
  event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (patient_id, owner_id) references public.patients(id, owner_id) on delete restrict,
  check ((calendar_id is null) = (event_id is null))
);
create index sessions_patient_date on public.sessions(patient_id, session_date desc);
create index sessions_owner_date on public.sessions(owner_id, session_date desc);

create table public.appointment_links (
  owner_id uuid not null default auth.uid() references auth.users(id),
  calendar_id text not null,
  event_id text not null,
  patient_id uuid not null,
  primary key (owner_id, calendar_id, event_id),
  foreign key (patient_id, owner_id) references public.patients(id, owner_id) on delete restrict
);

alter table public.patients enable row level security;
alter table public.sessions enable row level security;
alter table public.appointment_links enable row level security;

create policy doctor_patients on public.patients for all to authenticated
  using ((select public.is_doctor()) and owner_id = (select auth.uid()))
  with check ((select public.is_doctor()) and owner_id = (select auth.uid()));
create policy doctor_sessions on public.sessions for all to authenticated
  using ((select public.is_doctor()) and owner_id = (select auth.uid()))
  with check ((select public.is_doctor()) and owner_id = (select auth.uid()));
create policy doctor_links on public.appointment_links for all to authenticated
  using ((select public.is_doctor()) and owner_id = (select auth.uid()))
  with check ((select public.is_doctor()) and owner_id = (select auth.uid()));

revoke all on public.patients, public.sessions, public.appointment_links from anon, authenticated;
grant select, insert, update on public.patients, public.sessions to authenticated;
grant select, insert, update, delete on public.appointment_links to authenticated;
grant all on public.patients, public.sessions, public.appointment_links to service_role;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger patients_updated before update on public.patients for each row execute function public.touch_updated_at();
create trigger sessions_updated before update on public.sessions for each row execute function public.touch_updated_at();

-- Server-only integration storage: no browser role may read or write these tables.
create table public.google_connections (
  owner_id uuid primary key references auth.users(id),
  refresh_token_encrypted text not null,
  updated_at timestamptz not null default now()
);
create table public.google_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id),
  verifier_encrypted text not null,
  expires_at timestamptz not null
);
alter table public.google_connections enable row level security;
alter table public.google_oauth_states enable row level security;
revoke all on public.google_connections, public.google_oauth_states from public, anon, authenticated;
grant all on public.google_connections, public.google_oauth_states to service_role;


-- Source: 202611010002_patient_details.sql
-- Add the new fields without deleting historical patient email values.
alter table public.patients
  add column if not exists referred_by text not null default '' check (length(referred_by) <= 300),
  add column if not exists underlying_conditions text not null default '' check (length(underlying_conditions) <= 10000),
  add column if not exists medication text not null default '' check (length(medication) <= 10000);

notify pgrst, 'reload schema';


-- Source: 202611030001_record_deletion.sql
-- Allow the designated doctor to delete their records under the existing RLS policies.
grant delete on public.patients, public.sessions to authenticated;

-- Remove dependent records atomically; Google Calendar events are not touched.
create or replace function public.delete_patient_record(patient_id_to_delete uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.patients
    where id = patient_id_to_delete and owner_id = auth.uid() and public.is_doctor()
    for update;
  if not found then return false; end if;
  delete from public.appointment_links where patient_id = patient_id_to_delete and owner_id = auth.uid();
  delete from public.sessions where patient_id = patient_id_to_delete and owner_id = auth.uid();
  delete from public.patients where id = patient_id_to_delete and owner_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.delete_patient_record(uuid) from public, anon;
grant execute on function public.delete_patient_record(uuid) to authenticated;


-- Source: 202611030002_session_amounts.sql
-- Existing sessions intentionally have no recorded amount, rather than a zero fee.
alter table public.sessions add column if not exists amount_cents integer;
alter table public.sessions drop constraint if exists sessions_amount_cents_check;
alter table public.sessions add constraint sessions_amount_cents_check
  check (amount_cents is null or amount_cents between 0 and 100000000);


-- Source: 202611080001_patient_assessment.sql
-- Preserve historical dates of birth. Convert them to age only when adding this column.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'patients' and column_name = 'age') then
    alter table public.patients add column age integer check (age between 0 and 130);
    update public.patients
      set age = extract(year from age((now() at time zone 'Asia/Beirut')::date, date_of_birth))::integer
      where date_of_birth is not null
      and date_of_birth <= (now() at time zone 'Asia/Beirut')::date
      and extract(year from age((now() at time zone 'Asia/Beirut')::date, date_of_birth)) between 0 and 130;
  end if;
end;
$$;
alter table public.patients
  add column if not exists symptoms text not null default '' check (length(symptoms) <= 10000),
  add column if not exists assessment text not null default '' check (length(assessment) <= 10000),
  add column if not exists pain_management text not null default '' check (length(pain_management) <= 10000);
notify pgrst, 'reload schema';


-- Source: 202611080002_session_assessments.sql
-- Assessments belong to individual visits. Do not copy patient-level notes into past visits.
alter table public.sessions
  add column if not exists assessment text not null default '' check (length(assessment) <= 10000),
  add column if not exists pain_management text not null default '' check (length(pain_management) <= 10000);
notify pgrst, 'reload schema';


-- Source: 202611090001_calendar_matching.sql
alter table public.appointment_links alter column patient_id drop not null;
alter table public.appointment_links
  add column if not exists source text not null default 'manual',
  add column if not exists matched_event_name text not null default '',
  add column if not exists matched_patient_name text not null default '';
alter table public.appointment_links drop constraint if exists appointment_links_match_state;
alter table public.appointment_links add constraint appointment_links_match_state check (
  source in ('manual', 'automatic', 'blocked')
  and ((source = 'blocked' and patient_id is null) or (source <> 'blocked' and patient_id is not null))
  and length(matched_event_name) <= 2000 and length(matched_patient_name) <= 2000
);
notify pgrst, 'reload schema';


-- Source: 202611090002_session_payments.sql
-- Historical amounts are unconfirmed, not assumed paid or unpaid.
alter table public.sessions add column if not exists payment_received boolean;
alter table public.sessions drop constraint if exists sessions_payment_received_check;
alter table public.sessions add constraint sessions_payment_received_check check (
  payment_received is null or (amount_cents is not null and amount_cents > 0)
);
notify pgrst, 'reload schema';


-- Source: 202611150001_patient_intake.sql
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
