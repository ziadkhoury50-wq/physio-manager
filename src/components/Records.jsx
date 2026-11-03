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
} from 'lucide-react'
import { formatDate } from '../lib/dates'
import { Avatar, Empty } from './UI'

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
      <div className="profile-layout">
        <aside className="panel patient-information">
          <h3>Patient information</h3>
          <dl>
            <dt>Phone</dt>
            <dd>{patient.phone || 'Not provided'}</dd>
            <dt>Referred by</dt>
            <dd>{patient.referred_by || 'Not recorded'}</dd>
            <dt>Date of birth</dt>
            <dd>
              {patient.date_of_birth
                ? formatDate(patient.date_of_birth, { year: 'numeric' })
                : 'Not provided'}
            </dd>
            <dt>Status</dt>
            <dd>
              <span className="status-pill">{patient.archived ? 'Archived' : 'Active'}</span>
            </dd>
          </dl>
          <button
            className="button secondary full"
            disabled={saving}
            onClick={() => archivePatient(patient)}
          >
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
        </aside>
        <div className="profile-content">
          <div className="profile-notes">
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
