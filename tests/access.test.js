import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const doctor = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const patient = '33333333-3333-4333-8333-333333333333'

test('database enforces the single doctor, ownership, private integration storage, and record validation', async () => {
  const db = new PGlite()
  try {
    // Emulate the roles and identity function provided by Supabase, then apply the actual migration.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      insert into auth.users values ('${doctor}'), ('${other}');
    `)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611010001_workspace.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611010002_patient_details.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611030001_record_deletion.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611030002_session_amounts.sql', import.meta.url),
        'utf8',
      ),
    )
    const legacyPatient = '55555555-5555-4555-8555-555555555555'
    await db.exec(
      `insert into public.patients(id, owner_id, name, date_of_birth) values ('${legacyPatient}', '${doctor}', 'Legacy patient', '1990-04-12');`,
    )
    const patientMigration = await readFile(
      new URL('../supabase/migrations/202611080001_patient_assessment.sql', import.meta.url),
      'utf8',
    )
    await db.exec(patientMigration)
    assert.equal(
      (
        await db.query(
          `select age = extract(year from age((now() at time zone 'Asia/Beirut')::date, date_of_birth)) as correct from public.patients where id = '${legacyPatient}'`,
        )
      ).rows[0].correct,
      true,
    )
    assert.equal(
      (
        await db.query(
          `select date_of_birth::text as dob from public.patients where id = '${legacyPatient}'`,
        )
      ).rows[0].dob,
      '1990-04-12',
    )
    await db.exec(`update public.patients set age = null where id = '${legacyPatient}';`)
    await db.exec(patientMigration)
    assert.equal(
      (await db.query(`select age from public.patients where id = '${legacyPatient}'`)).rows[0].age,
      null,
    )
    await db.exec(`delete from public.patients where id = '${legacyPatient}';`)
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611080002_session_assessments.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611090001_calendar_matching.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/202611090002_session_payments.sql', import.meta.url),
        'utf8',
      ),
    )
    await db.exec(`insert into public.app_access(doctor_user_id) values ('${doctor}');`)
    await assert.rejects(() =>
      db.exec(`insert into public.app_access(doctor_user_id) values ('${other}');`),
    )
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${doctor}', false);`,
    )
    assert.equal((await db.query('select public.is_doctor() as allowed')).rows[0].allowed, true)
    await db.exec(
      "insert into public.appointment_links(calendar_id,event_id,patient_id,source) values ('cal','blocked',null,'blocked');",
    )
    assert.equal(
      (await db.query("select patient_id from public.appointment_links where event_id='blocked'"))
        .rows[0].patient_id,
      null,
    )
    await assert.rejects(() =>
      db.exec(
        "insert into public.appointment_links(calendar_id,event_id,patient_id,source) values ('cal','invalid',null,'automatic');",
      ),
    )
    await db.exec("delete from public.appointment_links where event_id='blocked';")
    await db.exec(
      `insert into public.patients(id, name, referred_by, underlying_conditions, medication) values ('${patient}', 'Synthetic Patient', 'Dr. Referral', 'Recorded condition', 'Recorded medication');`,
    )
    assert.deepEqual(
      (await db.query('select referred_by, underlying_conditions, medication from public.patients'))
        .rows[0],
      {
        referred_by: 'Dr. Referral',
        underlying_conditions: 'Recorded condition',
        medication: 'Recorded medication',
      },
    )
    await assert.rejects(() =>
      db.exec(`update public.patients set referred_by = repeat('x', 301) where id = '${patient}';`),
    )
    await db.exec(
      `insert into public.sessions(patient_id, session_date, treatment, pain_score) values ('${patient}', '2026-11-01', 'Synthetic treatment', 0);`,
    )
    assert.equal((await db.query('select * from public.sessions')).rows.length, 1)
    assert.deepEqual(
      (await db.query('select assessment, pain_management from public.sessions')).rows[0],
      { assessment: '', pain_management: '' },
    )
    await db.exec(
      "update public.sessions set assessment = 'Visit findings', pain_management = 'Visit pain plan';",
    )
    await assert.rejects(() =>
      db.exec("update public.sessions set assessment = repeat('x', 10001);"),
    )
    await assert.rejects(() =>
      db.exec("update public.sessions set pain_management = repeat('x', 10001);"),
    )
    await db.exec(
      `update public.patients set age = 0, symptoms = 'Recorded symptoms', assessment = 'Recorded findings', pain_management = 'Recorded plan';`,
    )
    assert.deepEqual(
      (await db.query('select age, symptoms, assessment, pain_management from public.patients'))
        .rows[0],
      {
        age: 0,
        symptoms: 'Recorded symptoms',
        assessment: 'Recorded findings',
        pain_management: 'Recorded plan',
      },
    )
    await assert.rejects(() => db.exec('update public.patients set age = -1;'))
    await assert.rejects(() => db.exec('update public.patients set age = 131;'))
    await assert.rejects(() => db.exec("update public.patients set symptoms = repeat('x', 10001);"))
    assert.equal(
      (await db.query('select amount_cents from public.sessions')).rows[0].amount_cents,
      null,
    )
    await db.exec('update public.sessions set amount_cents = 4525;')
    assert.equal(
      (await db.query('select amount_cents from public.sessions')).rows[0].amount_cents,
      4525,
    )
    await assert.rejects(() => db.exec('update public.sessions set amount_cents = -1;'))
    await assert.rejects(() => db.exec('update public.sessions set amount_cents = 100000001;'))
    assert.equal(
      (await db.query('select payment_received from public.sessions')).rows[0].payment_received,
      null,
    )
    await db.exec('update public.sessions set payment_received = true;')
    assert.equal(
      (await db.query('select payment_received from public.sessions')).rows[0].payment_received,
      true,
    )
    await assert.rejects(() => db.exec('update public.sessions set amount_cents = null;'))
    await db.exec('update public.sessions set amount_cents = 0, payment_received = null;')
    assert.equal(
      (await db.query('select amount_cents from public.sessions')).rows[0].amount_cents,
      0,
    )
    await assert.rejects(() =>
      db.exec(
        `insert into public.sessions(patient_id, session_date, treatment, pain_score) values ('${patient}', '2026-11-01', 'Invalid pain', 11);`,
      ),
    )
    await assert.rejects(() => db.exec(`insert into public.patients(name) values ('   ');`))
    await assert.rejects(() =>
      db.exec(`update public.patients set owner_id = '${other}' where id = '${patient}';`),
    )
    await assert.rejects(() => db.exec('select * from public.google_connections;'))
    await assert.rejects(() => db.exec('select * from public.google_oauth_states;'))
    await assert.rejects(() => db.exec('update public.app_access set doctor_user_id = auth.uid();'))
    await assert.rejects(() => db.exec('delete from public.patients;'))
    await db.exec(`update public.patients set archived = true where id = '${patient}';`)
    assert.equal((await db.query('select * from public.sessions')).rows.length, 1)
    await db.exec(`select set_config('request.jwt.claim.sub', '${other}', false);`)
    assert.equal((await db.query('select public.is_doctor() as allowed')).rows[0].allowed, false)
    assert.equal((await db.query('select * from public.patients')).rows.length, 0)
    assert.equal((await db.query('select * from public.sessions')).rows.length, 0)
    await assert.rejects(() =>
      db.exec(`insert into public.patients(name) values ('Unauthorized');`),
    )
    assert.equal(
      (await db.query(`select public.delete_patient_record('${patient}') as deleted`)).rows[0]
        .deleted,
      false,
    )
    await db.exec(
      `delete from public.sessions; select set_config('request.jwt.claim.sub', '${doctor}', false);`,
    )
    assert.equal((await db.query('select * from public.sessions')).rows.length, 1)
    const extra = await db.query(
      `insert into public.sessions(patient_id, session_date, treatment) values ('${patient}', '2026-11-03', 'Second session') returning id`,
    )
    await db.query('delete from public.sessions where id = $1', [extra.rows[0].id])
    assert.equal((await db.query('select * from public.sessions')).rows.length, 1)
    await db.exec(
      `insert into public.appointment_links(patient_id, calendar_id, event_id) values ('${patient}', 'calendar', 'event');`,
    )
    await db.exec(
      `reset role; create function public.block_test_delete() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$; create trigger block_test_delete before delete on public.patients for each row execute function public.block_test_delete(); set role authenticated;`,
    )
    await assert.rejects(() => db.query(`select public.delete_patient_record('${patient}')`))
    for (const table of ['patients', 'sessions', 'appointment_links'])
      assert.equal((await db.query(`select * from public.${table}`)).rows.length, 1)
    await db.exec(
      'reset role; drop trigger block_test_delete on public.patients; drop function public.block_test_delete(); set role authenticated;',
    )
    assert.equal(
      (await db.query(`select public.delete_patient_record('${patient}') as deleted`)).rows[0]
        .deleted,
      true,
    )
    for (const table of ['patients', 'sessions', 'appointment_links'])
      assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0)
    assert.equal(
      (await db.query(`select public.delete_patient_record('${patient}') as deleted`)).rows[0]
        .deleted,
      false,
    )
    await db.exec('reset role; set role anon;')
    await assert.rejects(() => db.query(`select public.delete_patient_record('${patient}')`))
    await assert.rejects(() => db.exec('select * from public.patients;'))
    await assert.rejects(() => db.exec('select * from public.sessions;'))
    await assert.rejects(() => db.exec('select * from public.google_connections;'))
    await assert.rejects(() => db.exec('select public.is_doctor();'))
  } finally {
    await db.close()
  }
})
