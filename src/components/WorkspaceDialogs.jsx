import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { CLINIC_ZONE, eventDate, eventTime, formatDate } from '../lib/dates'
import { Dialog, Field } from './UI'
import Select from './Select'
import './Select.css'
import ClinicalAssistant from './ClinicalAssistant'
import { usd } from '../lib/revenue'
import FieldAIHelp from './FieldAIHelp'
import './PatientMatching.css'

export default function WorkspaceDialogs({
  modal,
  draft,
  update,
  saving,
  formError,
  closeModal,
  saveRecord,
  data,
  openSession,
  deleteSession,
  linkPatient,
  calendarId,
  timeZone,
  setTimeZone,
  connection,
  calendars,
  setCalendarId,
  savedAt,
  disconnectGoogle,
  calendarBusy,
  connectGoogle,
  calendarError,
  auth,
  onProfile,
  onSignOut,
}) {
  const sessionPatient = data.patients.find((item) => item.id === draft.patient_id)
  if (!modal) return null
  if (modal.type === 'patient')
    return (
      <Dialog
        key="patient"
        title={modal.editing ? 'Edit patient' : 'New patient'}
        subtitle="Keep the essentials together. You can add more later."
        onClose={closeModal}
        wide
      >
        <form onSubmit={saveRecord}>
          <div className="form-grid">
            <Field label="Full name *">
              <input
                required
                maxLength={160}
                autoComplete="off"
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Patient’s full name"
              />
            </Field>
            <Field label="Age" hint="Age in whole years, as recorded.">
              <input
                type="number"
                min="0"
                max="130"
                step="1"
                inputMode="numeric"
                value={draft.age}
                onChange={(e) => update('age', e.target.value)}
              />
            </Field>
            <Field label="Phone number">
              <input
                type="tel"
                maxLength={50}
                value={draft.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+961 …"
              />
            </Field>
            <Field label="Referred by">
              <input
                type="text"
                maxLength={300}
                value={draft.referred_by}
                onChange={(e) => update('referred_by', e.target.value)}
                placeholder="Name of the doctor or person who referred them"
              />
            </Field>
            <Field label="Presenting condition">
              <input
                maxLength={300}
                value={draft.condition}
                onChange={(e) => update('condition', e.target.value)}
                placeholder="e.g. Right shoulder rehabilitation"
              />
            </Field>
            <Field label="Underlying conditions">
              <textarea
                rows={2}
                maxLength={10000}
                value={draft.underlying_conditions}
                onChange={(e) => update('underlying_conditions', e.target.value)}
                placeholder="Other health conditions or relevant diagnoses"
              />
            </Field>
            <Field label="Symptoms" wide>
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.symptoms}
                onChange={(e) => update('symptoms', e.target.value)}
                placeholder="Reported symptoms, location, onset, and aggravating or easing factors"
              />
            </Field>
            <Field label="Medication" wide>
              <textarea
                rows={2}
                maxLength={10000}
                value={draft.medication}
                onChange={(e) => update('medication', e.target.value)}
                placeholder="Current medications and relevant details"
              />
            </Field>
            <Field label="Relevant history" wide>
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.history}
                onChange={(e) => update('history', e.target.value)}
                placeholder="Relevant medical history, previous injuries, or precautions…"
              />
            </Field>
            <Field label="Treatment goals" wide>
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.goals}
                onChange={(e) => update('goals', e.target.value)}
                placeholder="What would the patient like to get back to?"
              />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button className="button primary" disabled={saving}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save
              patient
            </button>
          </div>
        </form>
      </Dialog>
    )
  if (modal.type === 'session')
    return (
      <Dialog
        key="session"
        title={modal.editing ? 'Edit session' : 'Record a session'}
        subtitle="A simple record of today’s care and what comes next."
        onClose={closeModal}
        wide
      >
        <form onSubmit={saveRecord}>
          <div className="form-grid">
            <Field label="Patient *">
              <Select
                required
                value={draft.patient_id}
                onChange={(e) => update('patient_id', e.target.value)}
              >
                <option value="">Choose a patient</option>
                {data.patients
                  .filter((item) => !item.archived || item.id === draft.patient_id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.archived ? ' (archived)' : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Session date *">
              <input
                type="date"
                required
                value={draft.session_date}
                onChange={(e) => update('session_date', e.target.value)}
              />
            </Field>
            <Field
              label="Session amount (USD)"
              hint="Optional. Leave blank if no amount is recorded."
            >
              <input
                type="text"
                inputMode="decimal"
                maxLength={12}
                value={draft.amount ?? ''}
                onChange={(e) => update('amount', e.target.value)}
                placeholder="e.g. 50.00"
              />
            </Field>
            <Field label="Symptoms / how the patient feels" wide>
              <textarea
                rows={2}
                maxLength={10000}
                value={draft.symptoms}
                onChange={(e) => update('symptoms', e.target.value)}
                placeholder="What has changed since the last visit?"
              />
            </Field>
            <Field label="Pain score (optional, 0–10)">
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                value={draft.pain_score}
                onChange={(e) => update('pain_score', e.target.value)}
                placeholder="0 = no pain, 10 = worst pain"
              />
            </Field>
            <Field
              label="Assessment findings"
              wide
              action={
                <FieldAIHelp
                  patient={sessionPatient}
                  sessions={data.sessions}
                  draft={draft}
                  update={update}
                  mode="assessment"
                />
              }
            >
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.assessment || ''}
                onChange={(e) => update('assessment', e.target.value)}
                placeholder="Findings from this visit, tests performed, measurements, and interpretation"
              />
            </Field>
            <Field
              label="Treatment performed *"
              wide
              action={
                <FieldAIHelp
                  patient={sessionPatient}
                  sessions={data.sessions}
                  draft={draft}
                  update={update}
                  mode="treatment"
                />
              }
            >
              <textarea
                required
                rows={3}
                maxLength={10000}
                value={draft.treatment}
                onChange={(e) => update('treatment', e.target.value)}
                placeholder="Exercises, manual therapy, techniques, and session details…"
              />
            </Field>
            <Field label="Pain management plan" wide>
              <textarea
                rows={3}
                maxLength={10000}
                value={draft.pain_management || ''}
                onChange={(e) => update('pain_management', e.target.value)}
                placeholder="Visit-specific pain-management strategies, advice, precautions, and review"
              />
            </Field>
            <Field label="Progress / response" wide>
              <textarea
                rows={2}
                maxLength={10000}
                value={draft.progress}
                onChange={(e) => update('progress', e.target.value)}
                placeholder="How did the patient respond?"
              />
            </Field>
            <Field label="Next-session plan" wide>
              <textarea
                rows={2}
                maxLength={10000}
                value={draft.plan}
                onChange={(e) => update('plan', e.target.value)}
                placeholder="Next steps, home exercises, and follow-up…"
              />
            </Field>
          </div>
          {formError && (
            <p role="alert" className="form-error">
              {formError}
            </p>
          )}
          {data.patients.some((item) => item.id === draft.patient_id) && (
            <ClinicalAssistant
              key={`${draft.patient_id}-${draft.id || 'new'}`}
              patient={data.patients.find((item) => item.id === draft.patient_id)}
              sessions={data.sessions}
              draft={draft}
              update={update}
            />
          )}
          {!data.patients.some((item) => !item.archived) && !draft.patient_id && (
            <p className="form-error">
              Add a patient from the Patients tab before recording a session.
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={closeModal}
            >
              Cancel
            </button>
            <button className="button primary" disabled={saving || !draft.patient_id}>
              {saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Save
              session
            </button>
          </div>
        </form>
      </Dialog>
    )
  if (modal.type === 'session-detail')
    return (
      <Dialog
        key="session-detail"
        title={data.patients.find((item) => item.id === draft.patient_id)?.name || 'Session record'}
        subtitle={formatDate(draft.session_date, { weekday: 'long', year: 'numeric' })}
        onClose={closeModal}
        wide
      >
        <div className="detail-badges">
          <span className="soft-badge">
            Session amount: {draft.amount_cents == null ? 'Not recorded' : usd(draft.amount_cents)}
          </span>
          <span className="status-pill">
            <CheckCircle2 size={13} /> Session recorded
          </span>
          {draft.pain_score != null && (
            <span className="soft-badge">Pain score: {draft.pain_score}/10</span>
          )}
          {draft.pain_score == null && <span className="soft-badge">Pain score: not recorded</span>}
          {draft.calendar_id && draft.event_id && (
            <span className="soft-badge">
              <CalendarDays size={13} />
              Linked Google Calendar appointment
            </span>
          )}
        </div>
        <div className="session-detail">
          {[
            ['Symptoms', 'symptoms'],
            ['Assessment findings', 'assessment'],
            ['Treatment performed', 'treatment'],
            ['Pain management plan', 'pain_management'],
            ['Progress / response', 'progress'],
            ['Next-session plan', 'plan'],
          ].map(([label, field]) => (
            <section key={field}>
              <h3>{label}</h3>
              <p>{draft[field] || 'Not recorded.'}</p>
            </section>
          ))}
        </div>
        <div className="dialog-actions">
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => onProfile(draft.patient_id)}
          >
            Patient profile
          </button>
          <button className="button danger" disabled={saving} onClick={() => deleteSession(draft)}>
            <Trash2 size={15} />
            {saving ? 'Deleting…' : 'Delete session'}
          </button>
          <button className="button primary" disabled={saving} onClick={() => openSession(draft)}>
            Edit session <ArrowRight size={15} />
          </button>
        </div>
      </Dialog>
    )
  if (modal.type === 'event') {
    const event = modal.event
    const link = data.links.find(
      (item) => item.event_id === event.id && item.calendar_id === calendarId,
    )
    const person = data.patients.find((item) => item.id === link?.patient_id)
    return (
      <Dialog
        key="event"
        title={event.summary || 'Untitled appointment'}
        subtitle={`${formatDate(eventDate(event, timeZone), { weekday: 'long' })} · ${eventTime(event, timeZone)}`}
        onClose={closeModal}
      >
        <div className="event-details">
          <span className="soft-badge">
            <CalendarDays size={13} /> Google Calendar · Read-only
          </span>
          {event.location && (
            <p>
              <MapPin size={16} />
              {event.location}
            </p>
          )}
          {event.description && (
            <p className="event-description">{event.description.replace(/<[^>]*>/g, '')}</p>
          )}
          {event.htmlLink && (
            <a className="text-link" href={event.htmlLink} target="_blank" rel="noreferrer">
              Open in Google Calendar <ExternalLink size={14} />
            </a>
          )}
          {link?.source === 'automatic' && (
            <p className="matching-note">
              Matched automatically by name. You can change or remove the link below.
            </p>
          )}
          {link?.source === 'blocked' && (
            <p className="matching-note">
              Kept unlinked. Automatic matching is off for this appointment; you can still select a
              patient manually.
            </p>
          )}
          {!person && link?.source !== 'blocked' && event.patientMatch?.candidates?.length > 0 && (
            <section className="patient-match-suggestions">
              <h3>Possible patients — review</h3>
              <p>Name similarity does not confirm identity. Choose the correct patient.</p>
              {event.patientMatch.candidates.map((candidate) => (
                <button
                  type="button"
                  className="button secondary"
                  key={candidate.patient_id}
                  disabled={saving}
                  onClick={() => linkPatient(event.id, candidate.patient_id)}
                >
                  <span>
                    {candidate.name}
                    <small>{candidate.reason}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
              {link?.source !== 'blocked' && (
                <button
                  type="button"
                  className="text-link"
                  disabled={saving}
                  onClick={() => linkPatient(event.id, '')}
                >
                  Keep this appointment unlinked
                </button>
              )}
            </section>
          )}
          <Field label="Link to a patient">
            <Select
              disabled={saving}
              value={link?.patient_id || ''}
              onChange={(e) => linkPatient(event.id, e.target.value)}
            >
              <option value="">No patient linked</option>
              {data.patients
                .filter((item) => !item.archived || item.id === link?.patient_id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="field-hint">
            This link stays in your practice. Your Google event is unchanged.
          </p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button className="button secondary" onClick={closeModal}>
            Close
          </button>
          <button
            className="button primary"
            disabled={!person || saving}
            onClick={() => openSession(null, person, event)}
          >
            <Plus size={16} /> Record session
          </button>
        </div>
      </Dialog>
    )
  }
  if (modal.type === 'settings')
    return (
      <Dialog
        key="settings"
        title="Your workspace"
        subtitle="Just the essentials for your practice."
        onClose={closeModal}
      >
        <div className="settings-content">
          <Field label="Clinic time zone">
            <Select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {[
                CLINIC_ZONE,
                'UTC',
                'Europe/London',
                'Europe/Paris',
                'Asia/Dubai',
                'America/New_York',
                'America/Los_Angeles',
              ].map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </Select>
          </Field>
          <div className="settings-section">
            <h3>Google Calendar</h3>
            <p>View existing appointments. Your patient records stay in this app.</p>
            {connection ? (
              <>
                <Field label="Calendar to display">
                  <Select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
                    {calendars.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.summary}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="connection-status">
                  <span className="status-dot" />
                  Connected · Read-only
                  {savedAt && (
                    <small>
                      Refreshed{' '}
                      {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  )}
                </div>
                <button
                  className="button secondary full"
                  disabled={saving}
                  onClick={disconnectGoogle}
                >
                  Disconnect calendar
                </button>
              </>
            ) : (
              <button
                className="button primary full"
                disabled={calendarBusy}
                onClick={connectGoogle}
              >
                Connect Google Calendar <ArrowRight size={16} />
              </button>
            )}
          </div>
          {calendarError && (
            <p className="form-error" role="alert">
              {calendarError}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="settings-section">
            <h3>Doctor account</h3>
            <p>{auth?.user?.email}</p>
            <button className="button secondary full" onClick={onSignOut}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      </Dialog>
    )
  return null
}
