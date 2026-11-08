import { createClient } from '@supabase/supabase-js'
import { HttpError } from './errors.js'
import { createCalendarService } from './google-calendar.js'

const patientColumns =
  'id,owner_id,name,phone,referred_by,age,symptoms,assessment,pain_management,condition,underlying_conditions,medication,history,goals,archived,created_at,updated_at'
const migrationError = () =>
  new HttpError(
    503,
    'Patient fields need the database update. Run 202611080001_patient_assessment.sql in Supabase SQL Editor, then retry.',
  )

async function readAll(db, table, column, ascending = true, secondary = 'id') {
  const records = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from(table)
      .select(table === 'patients' ? patientColumns : '*')
      .order(column, { ascending })
      .order(secondary)
      .range(offset, offset + 999)
    if (error) {
      if (['42703', 'PGRST204'].includes(error.code)) throw migrationError()
      throw new HttpError(503, 'Your records could not be loaded. Please try again.')
    }
    records.push(...data)
    if (data.length < 1000) return records
  }
}

export function createServices(config) {
  const admin = createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    async verify(token) {
      const db = createClient(config.supabaseUrl, config.publishableKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const {
        data: { user },
        error,
      } = await db.auth.getUser(token)
      if (error || !user)
        throw new HttpError(401, 'Your session has expired. Please sign in again.')
      const { data: allowed, error: accessError } = await db.rpc('is_doctor')
      if (accessError)
        throw new HttpError(
          503,
          'Database setup is incomplete or unavailable. Check the setup instructions and retry.',
        )
      if (!allowed)
        throw new HttpError(403, 'Only the designated doctor can access this workspace.')
      return { id: user.id, db }
    },
    records: {
      async remove({ db }, table, id) {
        const { data, error } =
          table === 'patients'
            ? await db.rpc('delete_patient_record', { patient_id_to_delete: id })
            : await db.from('sessions').delete().eq('id', id).select('id').maybeSingle()
        if (error) {
          if (['PGRST202', '42883', '42501'].includes(error.code))
            throw new HttpError(
              503,
              'Record deletion needs the database update. Run 202611030001_record_deletion.sql in Supabase SQL Editor, then retry.',
            )
          throw new HttpError(503, 'Could not delete this record. Please try again.')
        }
        if (!data) throw new HttpError(404, 'This record was not found in your workspace.')
      },
      async list({ db }) {
        const [patients, sessions, links] = await Promise.all([
          readAll(db, 'patients', 'name'),
          readAll(db, 'sessions', 'session_date', false),
          readAll(db, 'appointment_links', 'calendar_id', true, 'event_id'),
        ])
        return { patients, sessions, links }
      },
      async save({ db, id: owner }, table, record, id) {
        const query = id
          ? db.from(table).update(record).eq('id', id)
          : db.from(table).insert({ ...record, owner_id: owner })
        const { data, error } = await query
          .select(table === 'patients' ? patientColumns : '*')
          .maybeSingle()
        if (error) {
          if (['42703', 'PGRST204'].includes(error.code)) {
            if (table === 'sessions')
              throw new HttpError(
                503,
                'Session fields need the database updates. Run 202611030002_session_amounts.sql and 202611080002_session_assessments.sql in Supabase SQL Editor, then retry.',
              )
            throw migrationError()
          }
          if (error.code === '23503' || error.code === '23514')
            throw new HttpError(400, 'Check the patient and record details and try again.')
          throw new HttpError(
            503,
            'Could not save this record. Your changes are still here; please try again.',
          )
        }
        if (!data) throw new HttpError(404, 'This record was not found in your workspace.')
        return data
      },
      async link({ db, id: owner }, record) {
        const { data, error } = await db
          .from('appointment_links')
          .upsert({ ...record, owner_id: owner }, { onConflict: 'owner_id,calendar_id,event_id' })
          .select()
          .single()
        if (error)
          throw new HttpError(
            400,
            'Could not link this appointment. Check the patient and try again.',
          )
        return data
      },
      async unlink({ db }, { calendar_id, event_id }) {
        const { error } = await db
          .from('appointment_links')
          .delete()
          .eq('calendar_id', calendar_id)
          .eq('event_id', event_id)
        if (error) throw new HttpError(503, 'Could not remove this patient link. Please try again.')
      },
    },
    calendar: createCalendarService(admin, config),
  }
}
