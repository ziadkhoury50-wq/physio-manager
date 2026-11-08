import { useId } from 'react'
import { Activity, ClipboardList, Plus } from 'lucide-react'
import { formatDate } from '../lib/dates'
import { patientProgress } from '../lib/patient-progress'

export function ProgressMetrics({ sessions }) {
  const p = patientProgress(sessions)
  return (
    <div className="patient-progress-metrics" aria-label="Patient progress summary">
      {[
        ['Sessions recorded', String(sessions.length), 'Visits in this patient record'],
        [
          'Last recorded pain',
          p.latest ? `${p.latest.pain_score}/10` : '—',
          p.latest ? formatDate(p.latest.session_date) : 'No pain score recorded',
        ],
        [
          'Change from first score',
          p.change == null ? '—' : `${p.change > 0 ? '+' : ''}${p.change} pts`,
          p.change == null
            ? 'Needs two recorded scores'
            : `${p.baseline.pain_score}/10 → ${p.latest.pain_score}/10; lower is less reported pain`,
        ],
        [
          'Last visit',
          p.lastVisit ? formatDate(p.lastVisit, { month: 'short', year: 'numeric' }) : '—',
          'Based on saved session dates',
        ],
      ].map(([label, value, detail]) => (
        <section key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </section>
      ))}
    </div>
  )
}

export default function SessionProgress({ records, patient, openSession, viewSession }) {
  const p = patientProgress(records)
  const ordered = [...p.chronological].reverse()
  const chartId = useId()
  const points = p.scored.map((s, i) => ({
    ...s,
    x: p.scored.length === 1 ? 340 : 42 + (i * 596) / (p.scored.length - 1),
    y: 180 - s.pain_score * 14,
  }))
  return (
    <div className="session-progress-workspace">
      <div className="section-heading">
        <div>
          <h2>Assessment & pain management</h2>
          <p className="progress-caption">
            Compare visits, review the response, and plan the next session.
          </p>
        </div>
        <button className="button primary" onClick={() => openSession(null, patient)}>
          <Plus size={15} />
          Record session
        </button>
      </div>
      <section className="panel session-pain-chart">
        <h3>
          <Activity size={17} />
          Pain across sessions
        </h3>
        <p className="progress-caption">
          {p.scored.length} of {records.length} sessions have a pain score. Points follow visit
          order; dates may be unevenly spaced.
        </p>
        {points.length ? (
          <>
            <svg viewBox="0 0 680 220" role="img" aria-labelledby={chartId}>
              <title id={chartId}>
                Recorded pain scores from oldest to newest session, on a zero to ten scale
              </title>
              {[0, 5, 10].map((v) => (
                <g key={v}>
                  <line x1="40" x2="640" y1={180 - v * 14} y2={180 - v * 14} stroke="#dbe5dc" />
                  <text x="12" y={184 - v * 14} fill="#526b5b" fontSize="12">
                    {v}
                  </text>
                </g>
              ))}
              <polyline
                fill="none"
                stroke="#315f49"
                strokeWidth="3"
                points={points.map((s) => `${s.x},${s.y}`).join(' ')}
              />
              {points.map((s) => (
                <circle key={s.id} cx={s.x} cy={s.y} r="5" fill="#315f49">
                  <title>
                    {s.session_date}: {s.pain_score}/10
                  </title>
                </circle>
              ))}
              <text x="42" y="210" fontSize="12" fill="#526b5b">
                {formatDate(points[0].session_date, { month: 'short', year: 'numeric' })}
              </text>
              {points.length > 1 && (
                <text x="638" y="210" textAnchor="end" fontSize="12" fill="#526b5b">
                  {formatDate(points.at(-1).session_date, { month: 'short', year: 'numeric' })}
                </text>
              )}
            </svg>
            <p className="progress-caption">
              Pain is one part of progress. Review function, findings, and the patient's response
              alongside these scores.
            </p>
          </>
        ) : (
          <div className="progress-empty">
            <Activity size={24} />
            <p>
              Record pain scores in sessions to see the trend. Missing scores are never treated as
              zero.
            </p>
          </div>
        )}
      </section>
      <section className="session-assessment-history">
        <h3>
          <ClipboardList size={17} />
          Visit-by-visit assessment
        </h3>
        {records.length ? (
          ordered.map((session, i) => (
            <details className="panel session-assessment-card" key={session.id} open={i === 0}>
              <summary>
                <span>
                  <strong>
                    {formatDate(session.session_date, { weekday: 'short', year: 'numeric' })}
                  </strong>
                  <small>
                    {session.assessment ? 'Assessment recorded' : 'Assessment not yet recorded'}
                  </small>
                </span>
                <span className="soft-badge">
                  {session.pain_score == null
                    ? 'Pain not recorded'
                    : `Pain ${session.pain_score}/10`}
                </span>
              </summary>
              <div className="session-assessment-notes">
                {[
                  ['Symptoms', session.symptoms],
                  ['Assessment findings', session.assessment],
                  ['Pain management plan', session.pain_management],
                  ['Progress / response', session.progress],
                  ['Next-session plan', session.plan],
                ].map(([label, value]) => (
                  <section key={label}>
                    <h4>{label}</h4>
                    <p>{value || 'Not recorded for this session.'}</p>
                  </section>
                ))}
              </div>
              <div className="session-assessment-actions">
                <button className="button secondary" onClick={() => viewSession(session)}>
                  Full session
                </button>
                <button className="button secondary" onClick={() => openSession(session)}>
                  Edit this session
                </button>
              </div>
            </details>
          ))
        ) : (
          <div className="panel progress-empty">
            <p>
              No sessions yet. Record a visit to begin tracking assessment findings and pain
              management over time.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
