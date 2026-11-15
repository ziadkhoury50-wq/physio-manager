import { z } from 'zod'
import { HttpError } from './errors.js'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)
const question = z
  .object({
    id,
    label: z.string().trim().min(1).max(240),
    type: z.enum(['boolean', 'text', 'number', 'choice']),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(100)).max(12),
  })
  .strict()
  .refine(
    (q) =>
      q.type !== 'choice' ||
      (q.options.length >= 2 && new Set(q.options).size === q.options.length),
    'Choices must be distinct and include at least two options',
  )
export const intakeTabs = z
  .array(
    z
      .object({
        id,
        title: z.string().trim().min(1).max(80),
        questions: z.array(question),
      })
      .strict(),
  )
  .max(10)
  .superRefine((tabs, ctx) => {
    const ids = tabs.flatMap((t) => [t.id, ...t.questions.map((q) => q.id)])
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Use unique IDs for all tabs and questions.' })
  })
export const intakeSchema = z
  .object({
    tabs: intakeTabs,
    answers: z.record(
      id,
      z.union([z.boolean(), z.number().finite(), z.string().max(1200), z.null()]),
    ),
    summary: z.string().trim().max(10000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const questions = value.tabs.flatMap((t) => t.questions)
    if (Object.keys(value.answers).some((key) => !questions.some((q) => q.id === key)))
      ctx.addIssue({ code: 'custom', message: 'Unknown assessment question.' })
    for (const q of questions) {
      const a = value.answers[q.id]
      const empty = a == null || a === ''
      if (
        empty
          ? q.required
          : q.type === 'boolean'
            ? typeof a !== 'boolean'
            : q.type === 'number'
              ? typeof a !== 'number'
              : typeof a !== 'string' || (q.type === 'choice' && !q.options.includes(a))
      )
        ctx.addIssue({ code: 'custom', message: `Check the answer to ${q.label}.` })
    }
  })
export const templateSchema = z.object({ tabs: intakeTabs }).strict()
export const templateFileSchema = templateSchema
  .extend({
    format: z.literal('physiomanager-assessment-tabs'),
    version: z.literal(1),
  })
  .strict()

export function summarizeIntake(intake) {
  if (
    !intake.tabs.some((t) =>
      t.questions.some((q) => intake.answers[q.id] != null && intake.answers[q.id] !== ''),
    )
  )
    return ''
  const brief = (value, max) => (value.length > max ? `${value.slice(0, max)}…` : value)
  const lines = [
    'Answer overview — full answers are available below.',
    ...intake.tabs
      .filter((tab) => tab.questions.length > 0)
      .flatMap((tab) => [
        tab.title,
        ...tab.questions.map((q) => {
          const a = intake.answers[q.id]
          const value =
            a == null || a === ''
              ? 'Not answered'
              : a === true
                ? 'Yes'
                : a === false
                  ? 'No'
                  : String(a)
          return `${brief(q.label, 80)}: ${brief(value, 120)}`
        }),
      ]),
  ]
  let overview = ''
  for (const line of lines) {
    if (overview.length + line.length + 1 > 9000)
      return `${overview}\n\nOverview shortened. View the full assessment answers for the remaining questions.`
    overview += `${overview ? '\n' : ''}${line}`
  }
  return overview
}

export function createIntakeService() {
  return {
    async get({ db }) {
      const { data, error } = await db
        .from('intake_templates')
        .select('tabs,updated_at')
        .maybeSingle()
      if (error)
        throw new HttpError(
          503,
          'Assessment templates need the database update: run 202611150001_patient_intake.sql.',
        )
      return data || { tabs: [], updated_at: null }
    },
    async save({ db, id: owner }, record) {
      const { data, error } = await db
        .from('intake_templates')
        .upsert({ owner_id: owner, tabs: record.tabs })
        .select('tabs,updated_at')
        .single()
      if (error?.code === '23514')
        throw new HttpError(
          400,
          'This template exceeds the storage-size limit. Shorten question or choice text and try again.',
        )
      if (error)
        throw new HttpError(
          503,
          'Could not save the assessment template. Check the database update and retry.',
        )
      return data
    },
  }
}
