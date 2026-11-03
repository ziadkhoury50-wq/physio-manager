import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  Plus,
  Settings2,
  ShieldCheck,
  Users,
  X,
  ChevronRight,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { api, calendarApi } from './lib/api'
import { addDays, CLINIC_ZONE, dateKey, eventDate, formatDate, weekDates } from './lib/dates'
import { Brand, Empty } from './components/UI'
import SignIn from './components/SignIn'
import Calendar from './components/Calendar'
import { PatientDirectory, PatientProfile, SessionDirectory } from './components/Records'
import WorkspaceDialogs from './components/WorkspaceDialogs'
import './App.css'

const subscribe = (listener) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
const getRoute = () => window.location.hash.slice(1) || '/calendar'
const navigate = (route) => {
  window.location.hash = route
}
const navItems = [
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/patients', label: 'Patients', icon: Users },
  { path: '/sessions', label: 'Sessions', icon: ClipboardList },
]
const newPatient = {
  name: '',
  phone: '',
  referred_by: '',
  date_of_birth: '',
  condition: '',
  underlying_conditions: '',
  medication: '',
  history: '',
  goals: '',
}
const newSession = {
  patient_id: '',
  session_date: '',
  symptoms: '',
  pain_score: '',
  treatment: '',
  progress: '',
  plan: '',
}

export default function App() {
  const route = useSyncExternalStore(subscribe, getRoute)
  const [auth, setAuth] = useState(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [allowed, setAllowed] = useState(false)
  const [data, setData] = useState({ patients: [], sessions: [], links: [] })
  const [loading, setLoading] = useState(Boolean(supabase))
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null)
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [day, setDay] = useState(() => dateKey())
  const [searchState, setSearchState] = useState({ route: '', value: '' })
  const search = searchState.route === route ? searchState.value : ''
  const setSearch = (value) => setSearchState({ route, value })
  const [showArchived, setShowArchived] = useState(false)
  const [connection, setConnection] = useState(false)
  const [calendars, setCalendars] = useState([])
  const [calendarId, setCalendarId] = useState('')
  const [events, setEvents] = useState([])
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [calendarError, setCalendarError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [timeZone, setTimeZone] = useState(() => {
    try {
      const stored = localStorage.getItem('physio-timezone') || CLINIC_ZONE
      new Intl.DateTimeFormat('en', { timeZone: stored })
      return stored
    } catch {
      return CLINIC_ZONE
    }
  })
  const [savedAt, setSavedAt] = useState(null)
  const activeTab = route.startsWith('/patients')
    ? '/patients'
    : route.startsWith('/sessions')
      ? '/sessions'
      : '/calendar'
  const patientId = route.startsWith('/patients/') ? route.split('/')[2] : null
  const today = dateKey(now, timeZone)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data: result }) => {
      if (active) {
        setAuth(result.session)
        setAuthReady(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session)
      setAuthReady(true)
      if (!session) {
        setData({ patients: [], sessions: [], links: [] })
        setAllowed(false)
        setEvents([])
        setConnection(false)
        setCalendars([])
        setCalendarId('')
        setModal(null)
        setDirty(false)
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const load = useCallback(async () => {
    if (!supabase || !auth) return
    setLoading(true)
    setLoadError('')
    try {
      await api('/access')
      setAllowed(true)
      setData(await api('/records'))
    } catch (error) {
      if (error.status === 403) {
        setAllowed(false)
        setData({ patients: [], sessions: [], links: [] })
        return
      }
      setLoadError(error.message)
    } finally {
      setLoading(false)
    }
  }, [auth])
  useEffect(() => {
    // Start a new server read when the authenticated session changes.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    try {
      localStorage.setItem('physio-timezone', timeZone)
    } catch {
      /* Storage may be disabled. */
    }
  }, [timeZone])
  useEffect(() => {
    const prevent = (event) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  useEffect(() => {
    if (!allowed || !auth) return
    let active = true
    calendarApi('status')
      .then((result) => {
        if (active) setConnection(result.connected)
      })
      .catch((error) => {
        if (active) setCalendarError(error.message)
      })
    const result = new URLSearchParams(window.location.search).get('calendar')
    if (result) {
      // Consume the server's OAuth redirect result once and remove it from the URL.
      // oxlint-disable-next-line react/set-state-in-effect
      setNotice(
        result === 'connected'
          ? 'Google Calendar connected.'
          : 'Google connection was not completed. Please try again.',
      )
      const url = new URL(window.location.href)
      url.searchParams.delete('calendar')
      window.history.replaceState(null, '', url)
    }
    return () => {
      active = false
    }
  }, [allowed, auth, refresh])
  useEffect(() => {
    if (!connection || !allowed) return
    let active = true
    calendarApi('calendars')
      .then((result) => {
        if (active) {
          setCalendars(result.items)
          setCalendarId((current) =>
            result.items.some((item) => item.id === current)
              ? current
              : result.items.find((item) => item.primary)?.id || result.items[0]?.id || '',
          )
        }
      })
      .catch((error) => {
        if (active) setCalendarError(error.message)
      })
    return () => {
      active = false
    }
  }, [connection, allowed, refresh])
  useEffect(() => {
    if (!connection || !calendarId || !allowed) return
    let active = true
    // Clear the previous calendar while the selected range loads from Google.
    // oxlint-disable-next-line react/set-state-in-effect
    setCalendarBusy(true)
    setCalendarError('')
    setEvents([])
    const week = weekDates(day)
    calendarApi('events', {
      calendarId,
      timeMin: `${addDays(week[0], -1)}T00:00:00Z`,
      timeMax: `${addDays(week[6], 2)}T00:00:00Z`,
    })
      .then((result) => {
        if (active) {
          setEvents(result.items)
          setSavedAt(new Date())
        }
      })
      .catch((error) => {
        if (active) setCalendarError(error.message)
      })
      .finally(() => {
        if (active) setCalendarBusy(false)
      })
    return () => {
      active = false
    }
  }, [connection, calendarId, day, refresh, allowed])
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') setRefresh((value) => value + 1)
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  function closeModal() {
    if (saving) return
    if (dirty && !window.confirm('Discard your unsaved changes?')) return
    setModal(null)
    setDirty(false)
    setFormError('')
  }
  function openPatient(record) {
    setDraft(
      record
        ? { ...newPatient, ...record, date_of_birth: record.date_of_birth || '' }
        : { ...newPatient },
    )
    setModal({ type: 'patient', editing: Boolean(record) })
    setDirty(false)
    setFormError('')
  }
  function openSession(record, person, event) {
    setDraft(
      record
        ? { ...record, pain_score: record.pain_score ?? '' }
        : {
            ...newSession,
            session_date: event ? eventDate(event, timeZone) : dateKey(new Date(), timeZone),
            patient_id: person?.id || '',
            calendar_id: event ? calendarId : null,
            event_id: event?.id || null,
          },
    )
    setModal({ type: 'session', editing: Boolean(record) })
    setDirty(false)
    setFormError('')
  }
  function viewSession(record) {
    setDraft(record)
    setModal({ type: 'session-detail' })
    setDirty(false)
    setFormError('')
  }
  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setDirty(true)
  }
  function openSettings() {
    setModal({ type: 'settings' })
    setDirty(false)
    setFormError('')
  }

  async function saveRecord(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    const isPatient = modal.type === 'patient'
    const table = isPatient ? 'patients' : 'sessions'
    const fields = isPatient
      ? Object.keys(newPatient)
      : [...Object.keys(newSession), 'calendar_id', 'event_id']
    const record = Object.fromEntries(
      fields.map((field) => [
        field,
        typeof draft[field] === 'string' ? draft[field].trim() : (draft[field] ?? null),
      ]),
    )
    if (isPatient) record.date_of_birth = record.date_of_birth || null
    else record.pain_score = record.pain_score === '' ? null : Number(record.pain_score)
    if ((isPatient && !record.name) || (!isPatient && (!record.patient_id || !record.treatment))) {
      setFormError(
        isPatient
          ? 'Please enter the patient’s name.'
          : 'Choose a patient and enter the treatment performed.',
      )
      setSaving(false)
      return
    }
    try {
      const saved = await api(`/${table}${modal.editing ? `/${draft.id}` : ''}`, {
        method: modal.editing ? 'PATCH' : 'POST',
        body: record,
      })
      setData((current) => ({
        ...current,
        [table]: modal.editing
          ? current[table].map((item) => (item.id === saved.id ? saved : item))
          : [...current[table], saved],
      }))
      setDirty(false)
      setModal(null)
      setNotice(`${isPatient ? 'Patient' : 'Session'} ${modal.editing ? 'updated' : 'saved'}.`)
      if (isPatient) navigate(`/patients/${saved.id}`)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }
  async function deleteRecord(table, record) {
    if (saving) return
    const count = data.sessions.filter((item) => item.patient_id === record.id).length
    const message =
      table === 'patients'
        ? `Permanently delete ${record.name}, their ${count} session record${count === 1 ? '' : 's'}, and their appointment links? This cannot be undone. Google Calendar events will be kept.`
        : 'Permanently delete this session, including its notes and any saved assessment guide? This cannot be undone. The patient and Google Calendar event will be kept.'
    if (!window.confirm(message)) return
    setSaving(true)
    setFormError('')
    try {
      await api(`/${table}/${record.id}`, { method: 'DELETE' })
      setData((current) =>
        table === 'patients'
          ? {
              patients: current.patients.filter((item) => item.id !== record.id),
              sessions: current.sessions.filter((item) => item.patient_id !== record.id),
              links: current.links.filter((item) => item.patient_id !== record.id),
            }
          : { ...current, sessions: current.sessions.filter((item) => item.id !== record.id) },
      )
      setModal(null)
      setDirty(false)
      if (table === 'patients') navigate('/patients')
      setNotice(
        table === 'patients' ? 'Patient and associated records deleted.' : 'Session deleted.',
      )
    } catch (error) {
      setFormError(error.message)
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }
  async function archivePatient(person) {
    if (
      !window.confirm(
        person.archived
          ? 'Restore this patient to your active directory?'
          : 'Archive this patient? Their history and sessions will be kept.',
      )
    )
      return
    setSaving(true)
    try {
      await api(`/patients/${person.id}`, {
        method: 'PATCH',
        body: { archived: !person.archived },
      })
      setData((current) => ({
        ...current,
        patients: current.patients.map((item) =>
          item.id === person.id ? { ...item, archived: !item.archived } : item,
        ),
      }))
      setNotice(person.archived ? 'Patient restored.' : 'Patient archived.')
    } catch {
      setNotice('Could not update the patient. Please try again.')
    } finally {
      setSaving(false)
    }
  }
  async function linkPatient(eventId, id) {
    setSaving(true)
    setFormError('')
    try {
      await api('/appointment-links', {
        method: id ? 'PUT' : 'DELETE',
        body: { calendar_id: calendarId, event_id: eventId, ...(id ? { patient_id: id } : {}) },
      })
      setData((current) => ({
        ...current,
        links: [
          ...current.links.filter(
            (link) => !(link.calendar_id === calendarId && link.event_id === eventId),
          ),
          ...(id ? [{ calendar_id: calendarId, event_id: eventId, patient_id: id }] : []),
        ],
      }))
      setNotice(id ? 'Appointment linked to patient.' : 'Patient link removed.')
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }
  async function connectGoogle() {
    setCalendarBusy(true)
    setCalendarError('')
    try {
      const result = await calendarApi('connect')
      window.location.assign(result.url)
    } catch (error) {
      setCalendarError(error.message)
      setCalendarBusy(false)
    }
  }
  async function disconnectGoogle() {
    if (
      !window.confirm(
        'Disconnect Google Calendar? Patient and session records will stay in the app.',
      )
    )
      return
    setSaving(true)
    setFormError('')
    try {
      await calendarApi('disconnect')
      setConnection(false)
      setEvents([])
      setCalendarId('')
      setCalendars([])
      setNotice('Google Calendar disconnected.')
      setModal(null)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }
  function refreshCalendar() {
    setRefresh((value) => value + 1)
  }

  if (!supabase)
    return (
      <div className="access-page">
        <Brand />
        <Empty icon={Settings2} title="Set up your practice">
          Connect your Supabase authentication and Express server using the setup instructions in
          README.md. Patient records will appear after you sign in.
        </Empty>
      </div>
    )
  if (!authReady)
    return (
      <div className="full-loading">
        <LoaderCircle className="spin" /> Opening your workspace…
      </div>
    )
  if (!auth) return <SignIn onSession={setAuth} />
  if (loading && !allowed)
    return (
      <div className="full-loading">
        <LoaderCircle className="spin" /> Loading your practice…
      </div>
    )
  if (!allowed)
    return (
      <div className="access-page">
        <Brand />
        <Empty
          icon={ShieldCheck}
          title={loadError ? 'Workspace unavailable' : 'This workspace is private'}
          action={
            <div className="button-row">
              <button className="button secondary" onClick={load}>
                Retry
              </button>
              <button className="button primary" onClick={() => supabase.auth.signOut()}>
                Sign out
              </button>
            </div>
          }
        >
          {loadError || 'Only the doctor account configured in Supabase can open this workspace.'}
        </Empty>
      </div>
    )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map(({ path, label, icon: Icon }) => (
            <a
              key={path}
              href={`#${path}`}
              className={`nav-link ${activeTab === path ? 'active' : ''}`}
              aria-current={activeTab === path ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="doctor-account" onClick={openSettings}>
            <span className="doctor-avatar">DR</span>
            <span>
              <strong>My practice</strong>
              <small>Physiotherapist</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="breadcrumb">
            My practice <ChevronRight size={13} />{' '}
            <strong>{navItems.find((item) => item.path === activeTab)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span className="private-label">
              <ShieldCheck size={15} /> Private workspace
            </span>
            <span className="topbar-date">
              {formatDate(today, { weekday: 'short', year: 'numeric' })}
            </span>
            <button
              className="mobile-account doctor-avatar"
              aria-label="Open settings"
              onClick={openSettings}
            >
              DR
            </button>
          </div>
        </header>
        <main>
          {loadError && (
            <div className="error-banner" role="alert">
              {loadError}
              <button onClick={load}>Retry</button>
            </div>
          )}
          {!(activeTab === '/patients' && patientId) && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {activeTab === '/calendar'
                    ? 'SCHEDULE'
                    : activeTab === '/patients'
                      ? 'PATIENT DIRECTORY'
                      : 'CLINICAL NOTES'}
                </span>
                <h1>
                  Your {activeTab.slice(1)}
                  <span className="heading-dot">.</span>
                </h1>
                <p>
                  {activeTab === '/calendar'
                    ? 'Your appointments from Google Calendar.'
                    : activeTab === '/patients'
                      ? 'Patient details, treatment history, and progress.'
                      : 'Treatment notes and follow-up plans.'}
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => (activeTab === '/patients' ? openPatient() : openSession())}
              >
                <Plus size={17} />
                {activeTab === '/patients' ? 'New patient' : 'Record session'}
              </button>
            </div>
          )}
          {activeTab === '/calendar' && (
            <Calendar
              today={today}
              day={day}
              setDay={setDay}
              timeZone={timeZone}
              events={events}
              links={data.links}
              patients={data.patients}
              sessions={data.sessions}
              calendarId={calendarId}
              busy={calendarBusy}
              error={calendarError}
              connection={connection}
              refresh={refreshCalendar}
              connect={connectGoogle}
              openPatientProfile={(person) => navigate(`/patients/${person.id}`)}
              openEvent={(event) => {
                setModal({ type: 'event', event })
                setDirty(false)
                setFormError('')
              }}
              viewSession={viewSession}
            />
          )}
          {activeTab === '/patients' &&
            !patientId &&
            (loading ? (
              <div className="loading-inline">
                <LoaderCircle className="spin" /> Loading patients…
              </div>
            ) : (
              <PatientDirectory
                {...data}
                search={search}
                setSearch={setSearch}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
              />
            ))}
          {activeTab === '/patients' && patientId && (
            <PatientProfile
              patient={data.patients.find((item) => item.id === patientId)}
              sessions={data.sessions}
              openPatient={openPatient}
              openSession={openSession}
              archivePatient={archivePatient}
              deletePatient={(person) => deleteRecord('patients', person)}
              saving={saving}
              viewSession={viewSession}
            />
          )}
          {activeTab === '/sessions' && (
            <SessionDirectory
              {...data}
              search={search}
              setSearch={setSearch}
              viewSession={viewSession}
            />
          )}
          <footer className="main-footer">
            <span>PhysioManager</span>
            <span>
              <span className="status-dot" />
              Private workspace
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ path, label, icon: Icon }) => (
          <a
            key={path}
            href={`#${path}`}
            className={activeTab === path ? 'active' : ''}
            aria-current={activeTab === path ? 'page' : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      <WorkspaceDialogs
        deleteSession={(session) => deleteRecord('sessions', session)}
        {...{
          modal,
          draft,
          update,
          saving,
          formError,
          closeModal,
          saveRecord,
          data,
          openSession,
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
        }}
        onProfile={(id) => {
          closeModal()
          navigate(`/patients/${id}`)
        }}
        onSignOut={async () => {
          const { error } = await supabase.auth.signOut()
          if (error) setFormError('Could not sign out. Please try again.')
        }}
      />
    </div>
  )
}
