import { ArrowRight, CalendarDays, ClipboardList, LogOut, Settings2, UserRound } from 'lucide-react'
import { IntakeSettings } from './PatientIntake'
import { Field } from './UI'
import Select from './Select'
import { CLINIC_ZONE } from '../lib/dates'
import './SettingsPage.css'

export default function SettingsPage({
  onDirty,
  timeZone,
  setTimeZone,
  connection,
  calendars,
  calendarId,
  setCalendarId,
  savedAt,
  saving,
  disconnectGoogle,
  calendarBusy,
  connectGoogle,
  calendarError,
  auth,
  onSignOut,
}) {
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PRACTICE</span>
          <h1>Settings</h1>
          <p>Manage assessment templates, calendar connections, and your account.</p>
        </div>
      </div>
      <div className="settings-page-layout">
        <nav className="settings-section-nav" aria-label="Settings sections">
          <a
            href="#settings-assessments"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('settings-assessments')?.scrollIntoView({ block: 'start' })
            }}
          >
            <ClipboardList size={17} /> Assessment templates
          </a>
          <a
            href="#settings-calendar"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('settings-calendar')?.scrollIntoView({ block: 'start' })
            }}
          >
            <CalendarDays size={17} /> Google Calendar
          </a>
          <a
            href="#settings-clinic"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('settings-clinic')?.scrollIntoView({ block: 'start' })
            }}
          >
            <Settings2 size={17} /> Clinic preferences
          </a>
          <a
            href="#settings-account"
            onClick={(e) => {
              e.preventDefault()
              document.getElementById('settings-account')?.scrollIntoView({ block: 'start' })
            }}
          >
            <UserRound size={17} /> Doctor account
          </a>
        </nav>
        <div className="settings-panels">
          <section className="panel" id="settings-assessments">
            <IntakeSettings onDirty={onDirty} />
          </section>
          <section className="panel settings-section" id="settings-calendar">
            <h2>Google Calendar</h2>
            <p>Choose the calendar for appointments in your practice.</p>
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
                  <span className="status-dot" /> Connected · Read-only{' '}
                  {savedAt && (
                    <small>
                      Refreshed{' '}
                      {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </small>
                  )}
                </div>
                <button className="button secondary" disabled={saving} onClick={disconnectGoogle}>
                  Disconnect calendar
                </button>
              </>
            ) : (
              <button className="button primary" disabled={calendarBusy} onClick={connectGoogle}>
                Connect Google Calendar <ArrowRight size={16} />
              </button>
            )}
            {calendarError && (
              <p className="form-error" role="alert">
                {calendarError}
              </p>
            )}
          </section>
          <section className="panel settings-section" id="settings-clinic">
            <h2>Clinic preferences</h2>
            <p>Dates and appointment times use this time zone on this device.</p>
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
          </section>
          <section className="panel settings-section" id="settings-account">
            <h2>Doctor account</h2>
            <p>{auth?.user?.email}</p>
            <button className="button secondary" onClick={onSignOut}>
              <LogOut size={16} /> Sign out
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
