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
