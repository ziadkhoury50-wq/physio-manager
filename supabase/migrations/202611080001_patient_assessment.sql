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
