import { useState } from 'react'
import { Wallet, ClipboardList, Users, ChartColumn, ArrowUpRight } from 'lucide-react'
import { dashboardRange, revenueSummary, usd } from '../lib/revenue'
import { formatDate } from '../lib/dates'
import Select from './Select'
import './Dashboard.css'

export default function Dashboard({ sessions, patients, today, viewSession, loading }) {
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ start: `${today.slice(0, 7)}-01`, end: today })
  const [applied, setApplied] = useState(custom)
  const [rangeError, setRangeError] = useState('')
  const summary = revenueSummary(sessions, period, today, applied)
  const pending = custom.start !== applied.start || custom.end !== applied.end
  const rangeLabel = summary.range.start
    ? `${formatDate(summary.range.start, { year: 'numeric' })}${summary.range.start === summary.range.end ? '' : ` – ${formatDate(summary.range.end, { year: 'numeric' })}`}`
    : 'All recorded dates'
  const bucketLabel = (key) =>
    summary.granularity === 'year'
      ? key
      : formatDate(key.length === 7 ? `${key}-01` : key, {
          day: summary.granularity === 'month' ? undefined : 'numeric',
          month: 'short',
          year:
            period === 'all' || summary.range.start?.slice(0, 4) !== summary.range.end?.slice(0, 4)
              ? '2-digit'
              : undefined,
        })
  const max = Math.max(1, ...summary.buckets.map(([, cents]) => cents))
  const recent = [...summary.rows]
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 8)
  const metrics = [
    {
      label: 'Recorded revenue',
      value: usd(summary.total),
      detail: `${summary.priced} sessions with an amount`,
      icon: <Wallet size={18} />,
    },
    {
      label: 'Sessions',
      value: summary.rows.length,
      detail: 'Recorded in this period',
      icon: <ClipboardList size={18} />,
    },
    {
      label: 'Average session amount',
      value: summary.average == null ? '—' : usd(summary.average),
      detail: 'Across sessions with an amount',
      icon: <ChartColumn size={18} />,
    },
    {
      label: 'Patients seen',
      value: summary.patientCount,
      detail: 'Unique patients with session records',
      icon: <Users size={18} />,
    },
  ]
  if (loading)
    return (
      <p className="loading-inline" role="status">
        Loading your dashboard…
      </p>
    )
  return (
    <div className="revenue-dashboard">
      <div className="dashboard-intro">
        <div>
          <span className="eyebrow">PRACTICE OVERVIEW</span>
          <h1>Your work, at a glance.</h1>
          <p>Session activity and recorded amounts, together.</p>
        </div>
        <div className="dashboard-filters">
          <label className="dashboard-period">
            Period
            <Select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value)
                setRangeError('')
              }}
            >
              <option value="day">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This week</option>
              <option value="previousWeek">Last week</option>
              <option value="last7">Last 7 days</option>
              <option value="month">This month</option>
              <option value="previous">Last month</option>
              <option value="year">This year</option>
              <option value="all">All time</option>
              <option value="custom">Custom dates</option>
            </Select>
          </label>
          {period === 'custom' && (
            <div className="dashboard-custom-range">
              <label>
                Start date
                <input
                  type="date"
                  value={custom.start}
                  onChange={(e) => {
                    setCustom({ ...custom, start: e.target.value })
                    setRangeError('')
                  }}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  min={custom.start || undefined}
                  value={custom.end}
                  onChange={(e) => {
                    setCustom({ ...custom, end: e.target.value })
                    setRangeError('')
                  }}
                />
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const next = dashboardRange('custom', today, custom)
                  if (next.error) {
                    setRangeError(next.error)
                    return
                  }
                  setApplied({ ...custom })
                  setRangeError('')
                }}
              >
                Apply dates
              </button>
              {rangeError && (
                <p role="alert" className="dashboard-range-error">
                  {rangeError}
                </p>
              )}
              {!rangeError && pending && (
                <p className="dashboard-range-note">Date changes are not applied yet.</p>
              )}
            </div>
          )}
          <p className="dashboard-range-label" aria-live="polite">
            Showing: {rangeLabel}
          </p>
          <p className="dashboard-range-note">
            Weeks run Monday–Sunday. Custom dates include both start and end.
          </p>
        </div>
      </div>
      <div className="dashboard-metrics">
        {metrics.map(({ label, value, detail, icon }) => (
          <section className="dashboard-metric" key={label}>
            <div>
              <span>{label}</span>
              {icon}
            </div>
            <strong>{value}</strong>
            <p>{detail}</p>
          </section>
        ))}
      </div>
      <section className="revenue-chart panel">
        <div className="dashboard-section-title">
          <div>
            <h2>Revenue over time</h2>
            <p>Recorded amounts by {summary.granularity}</p>
          </div>
          <span className="soft-badge">USD</span>
        </div>
        {!summary.priced ? (
          <div className="dashboard-empty">
            <ChartColumn size={25} />
            <h3>No amounts recorded yet</h3>
            <p>Add an amount when recording or editing a session to see your revenue here.</p>
          </div>
        ) : (
          <div className="revenue-bars" role="list" aria-label="Recorded revenue by period">
            {summary.buckets.map(([label, cents]) => (
              <div
                className="revenue-column"
                key={label}
                role="listitem"
                aria-label={`${summary.granularity === 'week' ? 'Week of ' : ''}${label}: ${usd(cents)}`}
              >
                <span className="revenue-bar-value">{usd(cents)}</span>
                <div className="revenue-bar-track">
                  <div className="revenue-bar" style={{ height: `${(cents / max) * 100}%` }} />
                </div>
                <span className="revenue-bar-label">
                  {summary.granularity === 'week' ? 'Week of ' : ''}
                  {bucketLabel(label)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="dashboard-footnote">
          Totals use session dates and recorded amounts; they do not confirm payment.
          {summary.missing > 0
            ? ` ${summary.missing} session${summary.missing === 1 ? '' : 's'} in this period have no amount recorded and are excluded from revenue and average amounts.`
            : ''}
        </p>
      </section>
      <section className="panel dashboard-recent">
        <div className="dashboard-section-title">
          <div>
            <h2>Recent sessions</h2>
            <p>Review the details behind your totals.</p>
          </div>
          <a href="#/sessions" className="text-link">
            All sessions <ArrowUpRight size={15} />
          </a>
        </div>
        {recent.length ? (
          <div className="dashboard-session-list">
            {recent.map((s) => (
              <button key={s.id} className="dashboard-session-row" onClick={() => viewSession(s)}>
                <span>
                  <strong>{patients.find((p) => p.id === s.patient_id)?.name || 'Patient'}</strong>
                  <small>{formatDate(s.session_date, { year: 'numeric' })}</small>
                </span>
                <span className={s.amount_cents == null ? 'amount-missing' : 'session-amount'}>
                  {s.amount_cents == null ? 'Not recorded' : usd(s.amount_cents)}
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty">
            <p>No sessions recorded in this period.</p>
          </div>
        )}
      </section>
    </div>
  )
}
