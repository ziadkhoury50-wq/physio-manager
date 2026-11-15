import { useId, useState } from 'react'
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
  const [section, setSection] = useState('assessments')
  const id = useId()
  const sections = [
    ['assessments', 'Assessment templates', ClipboardList],
    ['calendar', 'Google Calendar', CalendarDays],
    ['clinic', 'Clinic preferences', Settings2],
    ['account', 'Doctor account', UserRound],
  ]
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
        <div
          className="settings-section-tabs"
          role="tablist"
          aria-label="Settings sections"
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const current = sections.findIndex((item) => item[0] === section)
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? sections.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) %
                    sections.length
            setSection(sections[next][0])
            event.currentTarget.querySelectorAll('[role="tab"]')[next].focus()
          }}
        >
          {sections.map(([value, label, Icon]) => (
            <button
              type="button"
              key={value}
              role="tab"
              id={`${id}-${value}-tab`}
              aria-controls={`${id}-${value}-panel`}
              aria-selected={section === value}
              tabIndex={section === value ? 0 : -1}
              onClick={(event) => {
                setSection(value)
                event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="settings-panels">
          <section
            className="panel"
            id={`${id}-assessments-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-assessments-tab`}
            hidden={section !== 'assessments'}
            tabIndex={0}
          >
            <IntakeSettings onDirty={onDirty} />
          </section>
          <section
            className="panel settings-section"
            id={`${id}-calendar-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-calendar-tab`}
            hidden={section !== 'calendar'}
            tabIndex={0}
          >
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
          <section
            className="panel settings-section"
            id={`${id}-clinic-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-clinic-tab`}
            hidden={section !== 'clinic'}
            tabIndex={0}
          >
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
          <section
            className="panel settings-section"
            id={`${id}-account-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-account-tab`}
            hidden={section !== 'account'}
            tabIndex={0}
          >
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
