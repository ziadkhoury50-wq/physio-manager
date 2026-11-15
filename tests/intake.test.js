import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { intakeSchema, templateSchema, summarizeIntake } from '../server/intake.js'

const tabs = [
  {
    id: 'screen',
    title: 'Screening',
    questions: [
      { id: 'pain', label: 'Night pain?', type: 'boolean', required: true, options: [] },
      { id: 'score', label: 'Pain score', type: 'number', required: true, options: [] },
      { id: 'side', label: 'Side', type: 'choice', required: false, options: ['Left', 'Right'] },
    ],
  },
]
test('intake validates answer types, required answers, choices and stable unique question IDs', () => {
  const record = { tabs, answers: { pain: false, score: 0 }, summary: 'Reviewed summary' }
  assert.equal(intakeSchema.parse(record).answers.pain, false)
  assert.equal(intakeSchema.parse(record).answers.score, 0)
  assert.match(summarizeIntake(record), /Night pain\?: No/)
  assert.match(summarizeIntake(record), /Pain score: 0/)
  assert.match(summarizeIntake(record), /Side: Not answered/)
  for (const answers of [
    { pain: null, score: 0 },
    { pain: 'false', score: 0 },
    { pain: true, score: '0' },
    { pain: true, score: 1, side: 'Both' },
    { pain: true, score: 1, unknown: true },
  ])
    assert.equal(intakeSchema.safeParse({ ...record, answers }).success, false)
  assert.equal(templateSchema.safeParse({ tabs: [...tabs, ...tabs] }).success, false)
})

test('doctor templates are private and patient question snapshots survive template changes', async () => {
  const db = new PGlite()
  const doctor = '11111111-1111-4111-8111-111111111111',
    other = '22222222-2222-4222-8222-222222222222'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      insert into auth.users values ('${doctor}'),('${other}');`)
    const folder = new URL('../supabase/migrations/', import.meta.url)
    for (const name of (await readdir(folder)).filter((n) => n.endsWith('.sql')).sort())
      await db.exec(await readFile(new URL(name, folder), 'utf8'))
    await db.exec(
      `insert into public.app_access values(true,'${doctor}'); set role authenticated; select set_config('request.jwt.claim.sub','${doctor}',false);`,
    )
    await db.query('insert into public.intake_templates(owner_id,tabs) values($1,$2)', [
      doctor,
      JSON.stringify(tabs),
    ])
    await db.query('insert into public.patients(name,intake) values($1,$2)', [
      'Test',
      { tabs, answers: { pain: false, score: 0 }, summary: 'Reviewed' },
    ])
    await db.exec(`update public.intake_templates set tabs='[]';`)
    const snapshot = (await db.query('select intake from public.patients')).rows[0].intake
    assert.equal(snapshot.tabs[0].questions[0].label, 'Night pain?')
    assert.equal(snapshot.answers.pain, false)
    assert.equal(snapshot.answers.score, 0)
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`)
    assert.equal((await db.query('select * from public.intake_templates')).rows.length, 0)
    assert.equal((await db.query('select * from public.patients')).rows.length, 0)
    await assert.rejects(() =>
      db.query('insert into public.intake_templates(owner_id) values($1)', [other]),
    )
    await db.exec('set role anon;')
    await assert.rejects(() => db.query('select * from public.intake_templates'))
  } finally {
    await db.close()
  }
})
