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
  const answered = intake.tabs
    .flatMap((tab) => tab.questions)
    .filter((q) => intake.answers[q.id] != null && intake.answers[q.id] !== '').length
  return answered
    ? `Answer overview: ${answered} answers recorded. Open assessment answers for details.`
    : ''
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
