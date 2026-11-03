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
