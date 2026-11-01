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
    await db.exec(`insert into public.app_access(doctor_user_id) values ('${doctor}');`)
    await assert.rejects(() =>
      db.exec(`insert into public.app_access(doctor_user_id) values ('${other}');`),
    )
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${doctor}', false);`,
    )
    assert.equal((await db.query('select public.is_doctor() as allowed')).rows[0].allowed, true)
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
    await db.exec('reset role; set role anon;')
    await assert.rejects(() => db.exec('select * from public.patients;'))
    await assert.rejects(() => db.exec('select * from public.sessions;'))
    await assert.rejects(() => db.exec('select * from public.google_connections;'))
    await assert.rejects(() => db.exec('select public.is_doctor();'))
  } finally {
    await db.close()
  }
})
