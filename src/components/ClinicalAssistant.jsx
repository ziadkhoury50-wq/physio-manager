import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ClipboardPlus, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api'
import './ClinicalAssistant.css'

export default function ClinicalAssistant({ patient, sessions, draft, update }) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState((patient.condition || '').slice(0, 180))
  const [context, setContext] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [added, setAdded] = useState([])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function prepare() {
    const history = sessions
      .filter((s) => s.patient_id === patient.id && s.id !== draft.id)
      .sort((a, b) => b.session_date.localeCompare(a.session_date))
      .slice(0, 3)
    const clinicalFields = ['condition', 'underlying_conditions', 'medication', 'history', 'goals']
    const todayFields = ['symptoms', 'pain_score', 'treatment', 'progress', 'plan']
    const lines = clinicalFields
      .filter((key) => patient[key])
      .map((key) => `${key.replaceAll('_', ' ')}: ${patient[key]}`)
    lines.push('\nCurrent session draft:')
    lines.push(
      ...todayFields
        .filter((key) => draft[key] !== '' && draft[key] != null)
        .map((key) => `${key.replaceAll('_', ' ')}: ${draft[key]}`),
    )
    history.forEach((s, i) => {
      lines.push(`\nPrevious session ${i + 1} (most recent first):`)
      lines.push(
        ...todayFields
          .filter((key) => s[key] !== '' && s[key] != null)
          .map((key) => `${key.replaceAll('_', ' ')}: ${s[key]}`),
      )
    })
    setContext(lines.join('\n').slice(0, 14000))
    setReviewed(false)
    setResult(null)
    setError('')
  }
  async function generate() {
    setBusy(true)
    setError('')
    setResult(null)
    setAdded([])
    try {
      const response = await api('/clinical-assistant', {
        method: 'POST',
        body: { topic, context, reviewed },
      })
      if (mounted.current) setResult(response)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  function addIdea(item, index) {
    const text = `Assessment idea for clinician review: ${item.name} — ${item.purpose}`
    const plan = [draft.plan, text].filter(Boolean).join('\n\n')
    if (plan.length > 10000) {
      setError('The session plan is full. Shorten it before adding an idea.')
      return
    }
    update('plan', plan)
    setAdded((old) => [...old, index])
  }
  return (
    <section className="clinical-assistant">
      <button
        type="button"
        className="clinical-toggle"
        aria-expanded={open}
        onClick={() => {
          if (!open && !context) prepare()
          setOpen(!open)
        }}
      >
        <BookOpen size={18} />
        <span>
          <strong>Assessment ideas</strong>
          <small>Clinical context, questions, and supporting literature</small>
        </span>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="clinical-body">
          <p>
            Review the clinical summary before sending it to Gemini. Names, contact details, dates
            of birth, and appointment details are excluded from the selected fields; remove any
            identifiers inside notes yourself. Free-tier Gemini content may be used to improve
            Google products.
          </p>
          <label>
            Literature search topic
            <input
              maxLength={180}
              value={topic}
              disabled={busy}
              onChange={(e) => {
                setTopic(e.target.value)
                setReviewed(false)
                setResult(null)
              }}
              placeholder="e.g. shoulder pain rotator cuff assessment"
            />
          </label>
          <label>
            Clinical summary to share
            <textarea
              rows={7}
              maxLength={14000}
              value={context}
              disabled={busy}
              onChange={(e) => {
                setContext(e.target.value)
                setReviewed(false)
                setResult(null)
              }}
            />
          </label>
          <button type="button" className="text-link" disabled={busy} onClick={prepare}>
            Refresh from profile and current session
          </button>
          <label className="clinical-consent">
            <input
              type="checkbox"
              checked={reviewed}
              disabled={busy}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              I reviewed both fields, removed identifying details, and agree to send this clinical
              text to Google and the search topic to PubMed.
            </span>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !reviewed || topic.trim().length < 3 || context.trim().length < 10}
            onClick={generate}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <BookOpen size={16} />}
            {busy ? 'Reviewing literature…' : 'Suggest assessments'}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="clinical-results" aria-live="polite">
              <p className="clinical-caption">
                Draft for clinician review · Suggestions do not document an examination or establish
                a diagnosis.
              </p>
              <p>{result.overview}</p>
              {result.evidenceWarning && (
                <p className="clinical-caution">{result.evidenceWarning}</p>
              )}
              {[
                ['Safety and referral considerations', result.safety],
                ['Questions to clarify', result.questions],
              ].map(
                ([title, items]) =>
                  items.length > 0 && (
                    <section key={title}>
                      <h3>{title}</h3>
                      <ul>
                        {items.map((text, i) => (
                          <li key={i}>{text}</li>
                        ))}
                      </ul>
                    </section>
                  ),
              )}
              <section>
                <h3>Candidate assessments</h3>
                {result.assessments.map((item, i) => (
                  <article className="clinical-card" key={i}>
                    <h4>{item.name}</h4>
                    <p>{item.purpose}</p>
                    <p>
                      <strong>Approach</strong> {item.approach}
                    </p>
                    <p>
                      <strong>Limits</strong> {item.limitations}
                    </p>
                    <div className="clinical-source-links">
                      {item.sourceIds.length ? (
                        item.sourceIds.map((id) => (
                          <a
                            key={id}
                            href={`https://pubmed.ncbi.nlm.nih.gov/${id}/`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PMID {id}
                          </a>
                        ))
                      ) : (
                        <span>General suggestion · no retrieved citation</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-link"
                      disabled={added.includes(i)}
                      onClick={() => addIdea(item, i)}
                    >
                      <ClipboardPlus size={14} />
                      {added.includes(i) ? 'Added to plan' : 'Add idea to session plan'}
                    </button>
                  </article>
                ))}
              </section>
              {result.uncertainties.length > 0 && (
                <section>
                  <h3>Evidence gaps and uncertainties</h3>
                  <ul>
                    {result.uncertainties.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h3>Retrieved literature</h3>
                <p className="clinical-caption">
                  PubMed records retrieved by relevance. Links verify the records, not the model’s
                  interpretation. Review the original evidence.
                </p>
                {result.sources.map((s) => (
                  <a
                    className="clinical-reference"
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {s.title}
                    <small>
                      {s.journal} · {s.date} · PMID {s.id}
                    </small>
                  </a>
                ))}
                <a
                  className="text-link"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.ncbi.nlm.nih.gov/books/?term=${encodeURIComponent(topic)}`}
                >
                  Explore books on NCBI Bookshelf
                </a>
              </section>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
