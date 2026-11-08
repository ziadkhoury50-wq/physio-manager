import { useId, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ClipboardList,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Trash2,
  Archive,
  ArchiveRestore,
  Pin,
} from 'lucide-react'
import { formatDate } from '../lib/dates'
import { Avatar, Empty } from './UI'
import { usd } from '../lib/revenue'
import './PatientProfile.css'
import SessionProgress, { ProgressMetrics } from './SessionProgress'
import { patientProgress } from '../lib/patient-progress'

export function SessionCard({ session, patient, onClick }) {
  return (
    <button className="session-card" onClick={onClick}>
      <span className="session-date">
        <strong>{formatDate(session.session_date, { day: '2-digit', month: undefined })}</strong>
        <span>{formatDate(session.session_date, { month: 'short', day: undefined })}</span>
      </span>
      <div className="session-card-body">
        <h3>{patient?.name || 'Patient'}</h3>
        <p>{session.treatment}</p>
        <span className="session-meta">
          <span className="status-dot" />
          Session recorded
          {session.amount_cents != null && (
            <>
              <span className="meta-divider">·</span>
              {usd(session.amount_cents)}
            </>
          )}
          {session.pain_score != null && (
            <>
              <span className="meta-divider">·</span>Pain {session.pain_score}/10
            </>
          )}
        </span>
      </div>
      <ChevronRight size={18} />
    </button>
  )
}

export function PatientDirectory({
  patients,
  sessions,
  search,
  setSearch,
  showArchived,
  setShowArchived,
}) {
  const filtered = patients
    .filter(
      (item) =>
        Boolean(item.archived) === showArchived &&
        `${item.name} ${item.phone} ${item.condition}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div className="directory-toolbar">
        <div className="tab-switch">
          <button
            className={!showArchived ? 'selected' : ''}
            onClick={() => setShowArchived(false)}
          >
            Active patients <span>{patients.filter((item) => !item.archived).length}</span>
          </button>
          <button className={showArchived ? 'selected' : ''} onClick={() => setShowArchived(true)}>
            Archived
          </button>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search patients"
            placeholder="Search name, phone or condition…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="patient-grid">
        {filtered.map((person, index) => {
          const records = sessions
            .filter((item) => item.patient_id === person.id)
            .sort((a, b) => b.session_date.localeCompare(a.session_date))
          return (
            <a className="patient-card" key={person.id} href={`#/patients/${person.id}`}>
              <div className="patient-card-top">
                <Avatar name={person.name} index={index} large />
                <span className="status-pill">
                  {person.archived ? 'Archived' : records.length ? 'Active' : 'New patient'}
                </span>
              </div>
              <h2>{person.name}</h2>
              <p>{person.condition || 'No condition recorded'}</p>
              <div className="patient-card-bottom">
                <span>
                  <ClipboardList size={14} />
                  {records.length} {records.length === 1 ? 'session' : 'sessions'}
                </span>
                <span>
                  {records[0]
                    ? formatDate(records[0].session_date, { month: 'short' })
                    : 'View profile'}
                  <ArrowRight size={14} />
                </span>
              </div>
            </a>
          )
        })}
      </div>
      {!filtered.length && (
        <Empty
          icon={Users}
          title={
            search
              ? 'No matching patients'
              : showArchived
                ? 'No archived patients'
                : 'Your care starts here'
          }
        >
          {search
            ? 'Try another name, phone number, or condition.'
            : showArchived
              ? 'Archived patients will appear here with their records preserved.'
              : 'Add your first patient to start keeping their history and session notes together.'}
        </Empty>
      )}
      <div className="page-footnote">
        <ShieldCheck size={14} /> Patient records are only accessible to your doctor account.
      </div>
    </>
  )
}

export function PatientProfile({
  patient,
  sessions,
  openPatient,
  openSession,
  archivePatient,
  deletePatient,
  saving,
  viewSession,
}) {
  const [profileTab, setProfileTab] = useState('sessions')
  const [showFullNextPlan, setShowFullNextPlan] = useState(false)
  const tabId = useId()
  if (!patient)
    return (
      <Empty
        icon={Users}
        title="Patient not found"
        action={
          <a href="#/patients" className="button primary">
            Back to patients
          </a>
        }
      >
        This patient could not be found in your workspace.
      </Empty>
    )
  const records = sessions
    .filter((item) => item.patient_id === patient.id)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
  const latestSession = patientProgress(records).chronological.at(-1)
  return (
    <>
      <a className="back-link" href="#/patients">
        <ArrowLeft size={15} /> All patients
      </a>
      <div className="profile-heading">
        <Avatar name={patient.name} large />
        <div>
          <span className="eyebrow">PATIENT PROFILE</span>
          <h1>{patient.name}</h1>
          <p>{patient.condition || 'No condition recorded'}</p>
        </div>
        <button className="button secondary" onClick={() => openPatient(patient)}>
          Edit patient
        </button>
      </div>
      {latestSession && (
        <section className="patient-next-plan" aria-label="Next session reminder">
          <Pin size={21} />
          <div>
            <h2>Next session — remember</h2>
            <span>
              From the session on {formatDate(latestSession.session_date, { year: 'numeric' })}
            </span>
            <p>
              {latestSession.plan?.trim()
                ? !showFullNextPlan && latestSession.plan.trim().length > 400
                  ? `${latestSession.plan.trim().slice(0, 400)}…`
                  : latestSession.plan.trim()
                : 'No next-session plan was recorded for the latest visit.'}
            </p>
            {latestSession.plan?.trim().length > 400 && (
              <button
                type="button"
                className="text-link"
                aria-expanded={showFullNextPlan}
                onClick={() => setShowFullNextPlan(!showFullNextPlan)}
              >
                {showFullNextPlan ? 'Show less' : 'Read full plan'}
              </button>
            )}
          </div>
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => openSession(latestSession)}
          >
            Update plan
          </button>
        </section>
      )}
      <div className="profile-layout">
        <aside className="panel patient-information">
          <h2 className="patient-information-title">Patient information</h2>
          <dl>
            <dt>Phone</dt>
            <dd>{patient.phone || 'Not provided'}</dd>
            <dt>Referred by</dt>
            <dd>{patient.referred_by || 'Not recorded'}</dd>
            <dt>Age</dt>
            <dd>
              {patient.age == null
                ? 'Not provided'
                : `${patient.age} ${patient.age === 1 ? 'year' : 'years'}`}
            </dd>
            <dt>Status</dt>
            <dd>
              <span className="status-pill">{patient.archived ? 'Archived' : 'Active'}</span>
            </dd>
          </dl>
          <div className="patient-record-actions">
            <button
              className="button secondary full"
              disabled={saving}
              onClick={() => archivePatient(patient)}
            >
              {patient.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              {patient.archived ? 'Restore patient' : 'Archive patient'}
            </button>
            <button
              className="button danger full"
              disabled={saving}
              onClick={() => deletePatient(patient)}
            >
              <Trash2 size={15} />
              Delete patient
            </button>
          </div>
        </aside>
        <div className="profile-content">
          <ProgressMetrics sessions={records} />
          <div
            className="patient-profile-tabs"
            role="tablist"
            aria-label="Patient records"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')]
              const current = tabs.indexOf(document.activeElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
              tabs[next].focus()
              setProfileTab(tabs[next].dataset.tab)
            }}
          >
            {[
              ['sessions', 'Session history', ClipboardList],
              ['assessment', 'Assessment & pain management', Activity],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`${tabId}-${value}-tab`}
                aria-controls={`${tabId}-${value}-panel`}
                aria-selected={profileTab === value}
                tabIndex={profileTab === value ? 0 : -1}
                data-tab={value}
                onClick={() => setProfileTab(value)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <section
            className="patient-profile-panel"
            id={`${tabId}-assessment-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-assessment-tab`}
            hidden={profileTab !== 'assessment'}
            tabIndex={0}
          >
            <SessionProgress
              records={records}
              patient={patient}
              openSession={openSession}
              viewSession={viewSession}
            />
            <details className="patient-background">
              <summary>Patient background</summary>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => openPatient(patient)}
              >
                Edit patient background
              </button>
              <div className="profile-notes">
                {[
                  ['Presenting condition', patient.condition, 'No presenting condition recorded.'],
                  ['Symptoms', patient.symptoms, 'No symptoms recorded yet.'],
                  [
                    'Previous patient-level assessment',
                    patient.assessment,
                    'No previous patient-level assessment.',
                  ],
                  [
                    'Previous patient-level pain plan',
                    patient.pain_management,
                    'No pain management plan recorded yet.',
                  ],
                ].map(([label, text, empty]) => (
                  <section className="panel" key={label}>
                    <span className="note-icon">
                      <Activity size={18} />
                    </span>
                    <h3>{label}</h3>
                    <p>{text || empty}</p>
                  </section>
                ))}
                <section className="panel">
                  <span className="note-icon">
                    <Activity size={18} />
                  </span>
                  <h3>Underlying conditions</h3>
                  <p>{patient.underlying_conditions || 'No underlying conditions recorded.'}</p>
                </section>
                <section className="panel">
                  <span className="note-icon">
                    <ClipboardList size={18} />
                  </span>
                  <h3>Medication</h3>
                  <p>{patient.medication || 'No medication recorded.'}</p>
                </section>
                <section className="panel">
                  <span className="note-icon">
                    <FileText size={18} />
                  </span>
                  <h3>Relevant history</h3>
                  <p>{patient.history || 'No history recorded yet.'}</p>
                </section>
                <section className="panel">
                  <span className="note-icon">
                    <Activity size={18} />
                  </span>
                  <h3>Treatment goals</h3>
                  <p>{patient.goals || 'No goals recorded yet.'}</p>
                </section>
              </div>
            </details>
          </section>
          <section
            className="patient-profile-panel"
            id={`${tabId}-sessions-panel`}
            role="tabpanel"
            aria-labelledby={`${tabId}-sessions-tab`}
            hidden={profileTab !== 'sessions'}
            tabIndex={0}
          >
            <div className="section-heading">
              <h2>
                Session history <span>{records.length}</span>
              </h2>
              <button className="button primary" onClick={() => openSession(null, patient)}>
                <Plus size={16} /> Record session
              </button>
            </div>
            <div className="sessions-list">
              {records.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  patient={patient}
                  onClick={() => viewSession(session)}
                />
              ))}
            </div>
            {!records.length && (
              <Empty title="The first step in their recovery">
                Record a session to start building this patient’s treatment history.
              </Empty>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

export function SessionDirectory({ patients, sessions, search, setSearch, viewSession }) {
  const filtered = [...sessions]
    .filter((item) =>
      `${patients.find((person) => person.id === item.patient_id)?.name || ''} ${item.treatment} ${item.session_date}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
  return (
    <>
      <div className="directory-toolbar">
        <span className="record-count">
          <ClipboardList size={17} />
          {sessions.length} recorded sessions
        </span>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search sessions"
            placeholder="Search patient or treatment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="sessions-list">
        {filtered.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            patient={patients.find((person) => person.id === session.patient_id)}
            onClick={() => viewSession(session)}
          />
        ))}
      </div>
      {!filtered.length && (
        <Empty
          icon={ClipboardList}
          title={search ? 'No matching sessions' : 'Make room for progress'}
        >
          {search
            ? 'Try another patient name or treatment.'
            : 'Record your first session to start a clear, useful treatment history.'}
        </Empty>
      )}
    </>
  )
}
