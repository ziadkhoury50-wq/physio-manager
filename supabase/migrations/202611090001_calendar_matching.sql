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
