import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ClipboardPlus, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api'
import './ClinicalAssistant.css'
import { clinicalContext } from '../lib/clinical-context'

export default function ClinicalAssistant({
  patient,
  sessions,
  draft,
  update,
  mode = 'assessment',
  initiallyOpen = false,
  insertionTarget = 'plan',
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [topic, setTopic] = useState((patient.condition || '').slice(0, 180))
  const [context, setContext] = useState(() =>
    initiallyOpen ? clinicalContext(patient, sessions, draft) : '',
  )
  const [performed, setPerformed] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [added, setAdded] = useState([])
  const [fullAdded, setFullAdded] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function prepare() {
    setContext(clinicalContext(patient, sessions, draft))
    setReviewed(false)
    setResult(null)
    setError('')
  }
  async function generate() {
    setBusy(true)
    setError('')
    setResult(null)
    setAdded([])
    setFullAdded(false)
    setPerformed(false)
    try {
      const response = await api('/clinical-assistant', {
        method: 'POST',
        body: { topic, context, reviewed, mode },
      })
      if (mounted.current) setResult(response)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  function addIdea(item, index, target = insertionTarget) {
    if (target === 'treatment' && !performed) return
    const text =
      target === 'plan'
        ? `${mode === 'treatment' ? 'Exercise/treatment option' : 'Assessment idea'} for clinician review: ${item.name} - ${item.purpose}${mode === 'treatment' ? `\nApproach: ${item.approach}\nPrecautions and limitations: ${item.limitations}${item.sourceIds.length ? '\nSources: ' + item.sourceIds.map((id) => 'PMID ' + id).join(', ') : ''}` : ''}`
        : `${target === 'treatment' ? 'Clinician-confirmed treatment' : 'Assessment consideration for clinician review'}: ${item.name}\nPurpose: ${item.purpose}\nApproach: ${item.approach}\nLimitations: ${item.limitations}${item.sourceIds.length ? '\nSources: ' + item.sourceIds.map((id) => 'PMID ' + id).join(', ') : ''}`
    const value = [draft[target], text].filter(Boolean).join('\n\n')
    if (value.length > 10000) {
      setError('This field is full. Shorten it before adding an idea.')
      return
    }
    update(target, value)
    setAdded((old) => [...old, index])
  }
  function addFullGuide() {
    const lines = [
      `${mode === 'treatment' ? 'TREATMENT OPTIONS' : 'ASSESSMENT GUIDE'} — draft for clinician review; not a record of care delivered.`,
      result.overview,
    ]
    for (const [label, items] of [
      ['Safety / referral considerations', result.safety],
      ['Questions', result.questions],
      ['Uncertainties', result.uncertainties],
    ]) {
      lines.push(`\n${label}`, ...items.map((text) => `• ${text}`))
    }
    lines.push(
      mode === 'treatment' ? '\nExercise and treatment options' : '\nCandidate assessments',
    )
    for (const item of result.assessments)
      lines.push(
        `\n${item.name}`,
        `Purpose: ${item.purpose}`,
        `Approach: ${item.approach}`,
        `Limitations: ${item.limitations}`,
        `Sources: ${item.sourceIds.length ? item.sourceIds.map((id) => `PMID ${id}`).join(', ') : 'General suggestion; no retrieved citation'}`,
      )
    if (result.evidenceWarning) lines.push(`\nEvidence warning: ${result.evidenceWarning}`)
    lines.push(
      '\nRetrieved literature (requires original-source review)',
      ...result.sources.map((s) => `${s.title} — ${s.journal}, ${s.date}\n${s.url}`),
    )
    if (result.modelUsed) lines.push(`\nModel: ${result.modelUsed}`)
    if (result.generatedAt) lines.push(`Generated: ${result.generatedAt}`)
    const plan = [draft.plan, lines.join('\n')].filter(Boolean).join('\n\n')
    if (plan.length > 10000) {
      setError(
        'The full guide exceeds the 10,000-character session-plan limit. Nothing was added. Add individual ideas instead.',
      )
      return
    }
    update('plan', plan)
    setFullAdded(true)
    setError('')
  }
  return (
    <section className="clinical-assistant">
      {!initiallyOpen && (
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
      )}
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
            {busy
              ? 'Reviewing literature…'
              : mode === 'treatment'
                ? 'Suggest exercises & treatment'
                : 'Suggest assessments'}
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
              {insertionTarget === 'treatment' && (
                <label className="clinical-consent">
                  <input
                    type="checkbox"
                    checked={performed}
                    onChange={(e) => setPerformed(e.target.checked)}
                  />
                  <span>
                    I reviewed the details and confirm that any treatment I insert was actually
                    performed. Planned exercises can be added to the next-session plan instead.
                  </span>
                </label>
              )}
              <button
                type="button"
                className="button secondary"
                disabled={fullAdded}
                onClick={addFullGuide}
              >
                <ClipboardPlus size={16} />
                {fullAdded ? 'Full guide added to plan' : 'Add full guide to session plan'}
              </button>
              <p className="clinical-caption">
                Save the session to keep added ideas or the full guide. They appear under
                Next-session plan when you reopen it.
                {result.modelUsed ? ` Generated with ${result.modelUsed}.` : ''}
              </p>
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
                <h3>
                  {mode === 'treatment' ? 'Exercise & treatment options' : 'Candidate assessments'}
                </h3>
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
                      disabled={
                        added.includes(i) || (insertionTarget === 'treatment' && !performed)
                      }
                      onClick={() => addIdea(item, i)}
                    >
                      <ClipboardPlus size={14} />
                      {added.includes(i)
                        ? 'Added'
                        : insertionTarget === 'treatment'
                          ? 'Add to performed treatment'
                          : insertionTarget === 'assessment'
                            ? 'Add assessment idea'
                            : 'Add idea to session plan'}
                    </button>
                    {insertionTarget === 'treatment' && (
                      <button
                        type="button"
                        className="text-link"
                        disabled={added.includes(i)}
                        onClick={() => addIdea(item, i, 'plan')}
                      >
                        Add to next-session plan
                      </button>
                    )}
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
