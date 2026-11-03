import { z } from 'zod'

const text = z.string().trim().max(10000)
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Enter a valid date')
export const uuid = z.string().uuid()
export const patientSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(50).optional(),
    referred_by: z.string().trim().max(300).optional(),
    date_of_birth: date.nullable().optional(),
    condition: z.string().trim().max(300).optional(),
    underlying_conditions: text.optional(),
    medication: text.optional(),
    history: text.optional(),
    goals: text.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
export const sessionSchema = z
  .object({
    patient_id: uuid,
    session_date: date,
    symptoms: text.optional(),
    pain_score: z.number().int().min(0).max(10).nullable().optional(),
    amount_cents: z.number().int().min(0).max(100000000).nullable().optional(),
    treatment: text.min(1),
    progress: text.optional(),
    plan: text.optional(),
    calendar_id: z.string().min(1).max(1024).nullable().optional(),
    event_id: z.string().min(1).max(1024).nullable().optional(),
  })
  .strict()
export const linkKeySchema = z
  .object({ calendar_id: z.string().min(1).max(1024), event_id: z.string().min(1).max(1024) })
  .strict()
export const linkSchema = linkKeySchema.extend({ patient_id: uuid })
export const eventQuerySchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    timeMin: z.string().datetime({ offset: true }),
    timeMax: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.timeMax) - Date.parse(value.timeMin)
    return duration > 0 && duration <= 14 * 86400000
  }, 'Choose a date range of up to 14 days')
export const patchSchema = (schema) =>
  schema.partial().refine((value) => Object.keys(value).length > 0, 'No changes supplied')
