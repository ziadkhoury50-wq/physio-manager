import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  Link2,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  Users,
} from 'lucide-react'
import { addDays, dateKey, eventOnDay, eventTime, formatDate, weekDates } from '../lib/dates'
import { Avatar, Empty, IconButton } from './UI'

export default function Calendar({
  day,
  today,
  setDay,
  timeZone,
  events,
  links,
  patients,
  sessions,
  calendarId,
  busy,
  error,
  connection,
  refresh,
  connect,
  openEvent,
  openPatientProfile,
  viewSession,
}) {
  const selectedEvents = events.filter((event) => eventOnDay(event, day, timeZone))
  return (
    <div className="calendar-layout">
      <section className="calendar-main">
        <div className="calendar-toolbar">
          <div className="calendar-month">
            <h2>{formatDate(day, { day: undefined, year: 'numeric' })}</h2>
            <span className="soft-badge">{timeZone}</span>
          </div>
          <div className="button-row">
            <button
              className="button today-button"
              onClick={() => setDay(dateKey(new Date(), timeZone))}
            >
              Today
            </button>
            <IconButton label="Previous week" onClick={() => setDay(addDays(day, -7))}>
              <ChevronLeft size={18} />
            </IconButton>
            <IconButton label="Next week" onClick={() => setDay(addDays(day, 7))}>
              <ChevronRight size={18} />
            </IconButton>
            <label className="date-picker">
              <CalendarDays size={17} />
              <input
                aria-label="Choose date"
                type="date"
                value={day}
                onChange={(e) => e.target.value && setDay(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="week-strip">
          {weekDates(day).map((date) => (
            <button
              key={date}
              className={`day-button ${day === date ? 'selected' : ''}`}
              onClick={() => setDay(date)}
              aria-pressed={day === date}
            >
              <span>
                {formatDate(date, { weekday: 'short', month: undefined, day: undefined })}
              </span>
              <strong>{Number(date.slice(-2))}</strong>
              <span
                className={`day-indicator ${events.some((event) => eventOnDay(event, date, timeZone)) ? 'has-events' : ''}`}
              />
            </button>
          ))}
        </div>
        <div className="calendar-matching-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !connection}
            onClick={refresh}
          >
            <Link2 size={15} />
            {busy ? 'Matching…' : 'Match this week'}
          </button>
          <span>Clear name matches link automatically. Uncertain matches stay for review.</span>
        </div>
        <div className="agenda-title">
          <h3>
            {day === today ? 'Today’s schedule' : formatDate(day, { weekday: 'long' })}
            <span>{selectedEvents.length}</span>
          </h3>
          <span className="agenda-view">
            <LayoutGrid size={14} /> Day agenda
          </span>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={refresh}>Retry</button>
            <button onClick={connect}>Reconnect</button>
          </div>
        )}
        {busy ? (
          <div className="loading-inline">
            <LoaderCircle className="spin" size={22} /> Loading calendar…
          </div>
        ) : !connection ? (
          <Empty
            icon={CalendarDays}
            title="Connect your calendar"
            action={
              <button className="button primary" onClick={connect}>
                Connect Google Calendar <ArrowRight size={16} />
              </button>
            }
          >
            Connect your Google Calendar to see your existing appointments here.
          </Empty>
        ) : selectedEvents.length === 0 ? (
          <Empty icon={CalendarDays} title="No appointments">
            No appointments for this day. Choose another date to see your schedule.
          </Empty>
        ) : (
          <div className="agenda-list">
            {selectedEvents.map((event, index) => {
              const link = links.find(
                (item) => item.event_id === event.id && item.calendar_id === calendarId,
              )
              const person = patients.find((item) => item.id === link?.patient_id)
              return (
                <div className="agenda-row" key={event.id}>
                  <div className="agenda-time">
                    <strong>{eventTime(event, timeZone)}</strong>
                    <span>
                      {event.end?.dateTime ? eventTime({ start: event.end }, timeZone) : ''}
                    </span>
                  </div>
                  <div className={`appointment appointment-${index % 4}`}>
                    <div className="appointment-top">
                      <span className="appointment-type">
                        {person
                          ? link?.source === 'automatic'
                            ? 'AUTO-LINKED PATIENT'
                            : 'PATIENT APPOINTMENT'
                          : link?.source === 'blocked'
                            ? 'UNLINKED APPOINTMENT'
                            : event.patientMatch?.candidates?.length
                              ? 'REVIEW PATIENT MATCH'
                              : 'GOOGLE CALENDAR'}
                      </span>
                      <button
                        className="appointment-details"
                        aria-label={`Open appointment details for ${event.summary || 'untitled appointment'}`}
                        onClick={() => openEvent(event)}
                      >
                        <MoreHorizontal size={19} />
                      </button>
                    </div>
                    <button
                      className="appointment-main"
                      aria-label={
                        person
                          ? `Open ${person.name} patient profile`
                          : `View appointment details for ${event.summary || 'untitled appointment'}`
                      }
                      onClick={() => (person ? openPatientProfile(person) : openEvent(event))}
                    >
                      <h3>{event.summary || 'Untitled appointment'}</h3>
                      <div className="appointment-footer">
                        <span>
                          <Clock3 size={13} />
                          {event.start.date
                            ? 'All day'
                            : `${Math.round((new Date(event.end?.dateTime || event.start.dateTime) - new Date(event.start.dateTime)) / 60000)} min`}
                        </span>
                        {event.location && (
                          <span className="appointment-location">
                            <MapPin size={13} />
                            {event.location}
                          </span>
                        )}
                        <span className="appointment-link">
                          {person ? (
                            <>
                              <Link2 size={12} /> {person.name}
                            </>
                          ) : (
                            'View details'
                          )}
                          <ArrowRight size={13} />
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div className="calendar-source">
          <span className="google-g">G</span>
          <span>
            {connection ? 'Google Calendar' : 'Google Calendar not connected'}
            <small>
              {connection
                ? 'Read-only · Changes stay in Google Calendar'
                : 'Your patient notes always stay here'}
            </small>
          </span>
          {connection && (
            <IconButton label="Refresh calendar" disabled={busy} onClick={refresh}>
              <RefreshCw size={15} />
            </IconButton>
          )}
        </div>
      </section>
      <aside className="day-sidebar">
        <section className="day-overview">
          <span className="mini-label">YOUR DAY AT A GLANCE</span>
          <div className="overview-number">
            {selectedEvents.length}
            <span>appointments</span>
          </div>
          <div className="overview-rule" />
          <div className="overview-bottom">
            <span className="overview-icon">
              <Users size={19} />
            </span>
            <span>
              <strong>{patients.filter((item) => !item.archived).length}</strong>
              <small>active patients in your care</small>
            </span>
            <ArrowDownLeft size={18} />
          </div>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading">
            <h3>Recent sessions</h3>
            <a href="#/sessions" aria-label="View all sessions">
              <ArrowRight size={18} style={{ transform: 'rotate(-40deg)' }} />
            </a>
          </div>
          {sessions.length ? (
            [...sessions]
              .sort((a, b) => b.session_date.localeCompare(a.session_date))
              .slice(0, 3)
              .map((session, index) => (
                <button
                  className="recent-session"
                  key={session.id}
                  onClick={() => viewSession(session)}
                >
                  <Avatar
                    name={patients.find((item) => item.id === session.patient_id)?.name}
                    index={index}
                  />
                  <span>
                    <strong>
                      {patients.find((item) => item.id === session.patient_id)?.name || 'Patient'}
                    </strong>
                    <small>
                      {formatDate(session.session_date, { month: 'short' })} · Session notes
                    </small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))
          ) : (
            <p className="panel-empty">Your recorded sessions will appear here.</p>
          )}
        </section>
      </aside>
    </div>
  )
}
