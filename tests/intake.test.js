import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  intakeSchema,
  templateSchema,
  summarizeIntake,
  templateFileSchema,
} from '../server/intake.js'
import {
  templateFile,
  importTabs,
  parseTemplateJson,
  exampleTemplate,
  templateAuthoringPrompt,
  templateInstructions,
} from '../src/lib/template-transfer.js'

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
test('template transfer validates file versions and excludes patient data; appending regenerates identifiers', () => {
  const file = templateFile(tabs)
  assert.deepEqual(templateFileSchema.parse(file).tabs, tabs)
  for (const invalid of [
    { ...file, version: 2 },
    { ...file, answers: { pain: true } },
    { ...file, patients: [] },
    { ...file, tabs: [{ ...tabs[0], questions: [{ ...tabs[0].questions[0], type: 'unknown' }] }] },
  ])
    assert.equal(templateFileSchema.safeParse(invalid).success, false)
  let n = 0
  const appended = importTabs(tabs, tabs, 'append', () => `new-${++n}`)
  assert.deepEqual(appended, tabs)
  const additions = [
    {
      ...tabs[0],
      title: ' SCREENING! ',
      questions: [
        { ...tabs[0].questions[0], label: 'night pain' },
        { id: 'new', label: 'Onset', type: 'text', required: false, options: [] },
      ],
    },
  ]
  const merged = importTabs(tabs, additions, 'append', () => `new-${++n}`)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].questions.length, 4)
  assert.equal(merged[0].questions[0].id, 'pain')
  assert.deepEqual(importTabs(merged, additions, 'append'), merged)
  assert.equal(importTabs([], [...tabs, ...tabs], 'replace').length, 1)
  assert.throws(
    () =>
      importTabs(
        tabs,
        [{ ...tabs[0], questions: [{ ...tabs[0].questions[0], type: 'text' }] }],
        'append',
      ),
    /different answer type/,
  )
  assert.throws(
    () =>
      importTabs(
        tabs,
        [{ ...tabs[0], questions: [{ ...tabs[0].questions[2], options: ['Left', 'Both'] }] }],
        'append',
      ),
    /different answer type/,
  )
  assert.match(templateInstructions(tabs), /Existing blank template/)
  assert.match(templateInstructions(tabs), /Night pain/)
  assert.equal(templateSchema.safeParse({ tabs: appended }).success, true)
  assert.equal(importTabs(tabs, tabs, 'replace', () => `new-${++n}`).length, 1)
  assert.equal(tabs[0].id, 'screen')
  assert.throws(
    () =>
      importTabs(
        Array.from({ length: 10 }, (_, i) => ({ ...tabs[0], title: `Tab ${i}` })),
        tabs,
        'append',
      ),
    /exceeds/,
  )
})
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

test('authoring example and fenced JSON import are valid, and question counts are uncapped', () => {
  assert.equal(templateFileSchema.safeParse(exampleTemplate).success, true)
  assert.deepEqual(
    parseTemplateJson('```json\n' + JSON.stringify(exampleTemplate) + '\n```'),
    exampleTemplate,
  )
  assert.match(templateAuthoringPrompt, /physiomanager-assessment-tabs/)
  assert.throws(() => parseTemplateJson('broken'), /not valid JSON/)
  assert.throws(() => parseTemplateJson('x'.repeat(80001)), /80 KB/)
  const many = [
    {
      id: 'many',
      title: 'Many questions',
      questions: Array.from({ length: 75 }, (_, i) => ({
        id: `q-${i}`,
        label: `Question ${i}`,
        type: 'text',
        required: false,
        options: [],
      })),
    },
  ]
  assert.equal(templateSchema.safeParse({ tabs: many }).success, true)
  assert.equal(importTabs([], many, 'append').length, 1)
  const answers = Object.fromEntries(
    many[0].questions.map((q) => [q.id, 'Long answer '.repeat(50)]),
  )
  const summary = summarizeIntake({ tabs: many, answers, summary: '' })
  assert.ok(summary.length <= 10000)
  assert.match(summary, /Overview shortened/)
})
