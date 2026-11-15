import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ClipboardList, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Field } from './UI'
import Select from './Select'
import './PatientIntake.css'

const empty = () => ({ tabs: [], answers: {}, summary: '' })
const uid = () => crypto.randomUUID()
const answerText = (value) =>
  value == null || value === ''
    ? 'Not answered'
    : value === true
      ? 'Yes'
      : value === false
        ? 'No'
        : String(value)
function intakeContext(patient) {
  const data = patient.intake || empty()
  return [
    patient.condition && `Recorded diagnosis: ${patient.condition}`,
    patient.symptoms && `Symptoms: ${patient.symptoms}`,
    patient.medication && `Medication: ${patient.medication}`,
    patient.age != null && patient.age !== '' && `Age: ${patient.age}`,
    patient.underlying_conditions && `Relevant history: ${patient.underlying_conditions}`,
    patient.history && `Underlying conditions: ${patient.history}`,
    patient.goals && `Treatment goals: ${patient.goals}`,
    patient.pain_management && `Pain management: ${patient.pain_management}`,
    ...data.tabs.flatMap((tab) => [
      tab.title,
      ...tab.questions.map((q) => `${q.label}: ${answerText(data.answers[q.id])}`),
    ]),
  ]
    .filter(Boolean)
    .join('\n')
}

export function IntakeSettings({ onDirty }) {
  const [tabs, setTabs] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  async function load() {
    setBusy(true)
    setError('')
    try {
      setTabs((await api('/intake-template')).tabs)
      setLoaded(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let alive = true
    api('/intake-template')
      .then((data) => {
        if (alive) {
          setTabs(data.tabs)
          setLoaded(true)
        }
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
      .finally(() => {
        if (alive) setBusy(false)
      })
    return () => {
      alive = false
    }
  }, [])
  function change(next) {
    onDirty?.(true)
    setTabs(next)
    setDirty(true)
    setSaved(false)
  }
  function tabChange(id, patch) {
    change(tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function questionChange(tab, id, patch) {
    tabChange(tab.id, {
      questions: tab.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })
  }
  function move(index, direction) {
    const next = [...tabs]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    change(next)
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      setTabs((await api('/intake-template', { method: 'PUT', body: { tabs } })).tabs)
      setDirty(false)
      onDirty?.(false)
      setSaved(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="intake-settings settings-section">
      <h3>Patient assessment templates</h3>
      <p>
        Create tabs and questions once for your practice. New patients use this template. Saved
        patient answers keep their original questions when you change the template.
      </p>
      {busy && <p role="status">Loading or saving template…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button className="text-link" onClick={load} type="button">
            Reload
          </button>
        </p>
      )}
      <fieldset disabled={busy || !loaded} className="intake-editor">
        {tabs.map((tab, index) => (
          <section className="intake-template-tab" key={tab.id}>
            <Field label={`Tab ${index + 1} name`}>
              <input
                value={tab.title}
                maxLength={80}
                onChange={(e) => tabChange(tab.id, { title: e.target.value })}
              />
            </Field>
            <div className="intake-actions">
              <button
                type="button"
                className="button secondary"
                aria-label={`Move tab ${index + 1} up`}
                disabled={!index}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="button secondary"
                aria-label={`Move tab ${index + 1} down`}
                disabled={index === tabs.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      'Remove this tab from the template? Saved patient answers will remain.',
                    )
                  )
                    change(tabs.filter((t) => t.id !== tab.id))
                }}
              >
                <Trash2 size={15} /> Remove tab
              </button>
            </div>
            {tab.questions.map((q, i) => (
              <div className="intake-question-editor" key={q.id}>
                <Field label={`Question ${i + 1}`}>
                  <input
                    value={q.label}
                    maxLength={240}
                    onChange={(e) => questionChange(tab, q.id, { label: e.target.value })}
                  />
                </Field>
                <Field label={`Answer type for question ${i + 1}`}>
                  <Select
                    value={q.type}
                    onChange={(e) =>
                      questionChange(tab, q.id, {
                        type: e.target.value,
                        options: e.target.value === 'choice' ? ['Option 1', 'Option 2'] : [],
                      })
                    }
                  >
                    <option value="boolean">Yes / No</option>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="choice">Choice</option>
                  </Select>
                </Field>
                {q.type === 'choice' && (
                  <Field
                    label={`Choices for question ${i + 1}`}
                    hint="One option per line; at least two distinct choices."
                  >
                    <textarea
                      rows={3}
                      value={q.options.join('\n')}
                      onChange={(e) =>
                        questionChange(tab, q.id, { options: e.target.value.split('\n') })
                      }
                    />
                  </Field>
                )}
                <label className="intake-required">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => questionChange(tab, q.id, { required: e.target.checked })}
                  />{' '}
                  Required answer
                </label>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    tabChange(tab.id, {
                      questions: tab.questions.filter((item) => item.id !== q.id),
                    })
                  }
                >
                  <Trash2 size={14} /> Remove question
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={
                tab.questions.length >= 10 || tabs.reduce((n, t) => n + t.questions.length, 0) >= 40
              }
              onClick={() =>
                tabChange(tab.id, {
                  questions: [
                    ...tab.questions,
                    { id: uid(), label: '', type: 'boolean', required: false, options: [] },
                  ],
                })
              }
            >
              <Plus size={15} /> Add question
            </button>
          </section>
        ))}
        <div className="intake-actions">
          <button
            type="button"
            className="button secondary"
            disabled={tabs.length >= 10}
            onClick={() => change([...tabs, { id: uid(), title: '', questions: [] }])}
          >
            <Plus size={15} /> Add tab
          </button>
          <button type="button" className="button primary" disabled={!dirty} onClick={save}>
            <Check size={15} /> Save template
          </button>
        </div>
      </fieldset>
      {dirty && <p role="status">Template changes are not saved yet.</p>}
      {saved && <p role="status">Template saved for your practice.</p>}
    </section>
  )
}

export function PatientIntakeForm({ draft, update, children }) {
  const [active, setActive] = useState('basics')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!draft.id)
  const [ready, setReady] = useState(Boolean(draft.id))
  const container = useRef(null)
  const intake = draft.intake || empty()
  useEffect(() => {
    const form = container.current?.closest('form')
    const guard = (event) => {
      if (!ready) {
        event.preventDefault()
        event.stopPropagation()
        setError(
          'Load the assessment template before saving. Please retry Use latest assessment template.',
        )
      }
    }
    form?.addEventListener('submit', guard, true)
    return () => form?.removeEventListener('submit', guard, true)
  }, [ready])
  useEffect(() => {
    if (draft.id) return
    let alive = true
    api('/intake-template')
      .then((template) => {
        if (alive) {
          update('intake', { ...empty(), tabs: template.tabs })
          setReady(true)
        }
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [draft.id, update])
  function answer(q, value) {
    update('intake', { ...intake, answers: { ...intake.answers, [q.id]: value }, summary: '' })
  }
  async function latest() {
    if (
      intake.tabs.length &&
      !window.confirm(
        'Use the latest template? Matching questions keep their answers; the existing summary will be cleared.',
      )
    )
      return
    setLoading(true)
    setError('')
    try {
      const { tabs } = await api('/intake-template')
      const oldQuestions = intake.tabs.flatMap((t) => t.questions)
      const answers = {}
      for (const q of tabs.flatMap((t) => t.questions)) {
        const old = oldQuestions.find((item) => item.id === q.id)
        const value = intake.answers[q.id]
        if (
          old?.type === q.type &&
          old.label === q.label &&
          (q.type !== 'choice' || q.options.includes(value))
        )
          answers[q.id] = value ?? null
      }
      update('intake', { tabs, answers, summary: '' })
      setReady(true)
      setActive('basics')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="patient-intake-form" ref={container}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading assessment template…</p>}
      <div className="intake-tabs" aria-label="Patient form sections">
        {[{ id: 'basics', title: 'Patient details' }, ...intake.tabs].map((tab) => (
          <button
            type="button"
            className={active === tab.id ? 'selected' : ''}
            aria-pressed={active === tab.id}
            key={tab.id}
            onClick={() => setActive(tab.id)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div hidden={active !== 'basics'} onInvalidCapture={() => setActive('basics')}>
        {children}
      </div>
      {intake.tabs.map((tab) => (
        <section key={tab.id} hidden={active !== tab.id} onInvalidCapture={() => setActive(tab.id)}>
          <h3>{tab.title}</h3>
          <div className="intake-answer-grid">
            {tab.questions.map((q) => (
              <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`}>
                {q.type === 'text' ? (
                  <textarea
                    rows={3}
                    maxLength={1200}
                    required={q.required}
                    value={intake.answers[q.id] ?? ''}
                    onChange={(e) => answer(q, e.target.value)}
                  />
                ) : q.type === 'number' ? (
                  <input
                    type="number"
                    step="any"
                    required={q.required}
                    value={intake.answers[q.id] ?? ''}
                    onChange={(e) =>
                      answer(q, e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                ) : (
                  <Select
                    required={q.required}
                    value={intake.answers[q.id] == null ? '' : String(intake.answers[q.id])}
                    onChange={(e) =>
                      answer(
                        q,
                        e.target.value === ''
                          ? null
                          : q.type === 'boolean'
                            ? e.target.value === 'true'
                            : e.target.value,
                      )
                    }
                  >
                    <option value="">Not answered</option>
                    {(q.type === 'boolean' ? ['true', 'false'] : q.options).map((value) => (
                      <option value={value} key={value}>
                        {q.type === 'boolean' ? (value === 'true' ? 'Yes' : 'No') : value}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>
        </section>
      ))}
      <div className="intake-actions">
        <button className="text-link" type="button" disabled={loading} onClick={latest}>
          Use latest assessment template
        </button>
      </div>
      {intake.tabs.length > 0 && (
        <IntakeSummary key={intakeContext(draft)} draft={draft} update={update} />
      )}
    </div>
  )
}

function IntakeSummary({ draft, update }) {
  const [context, setContext] = useState(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const intake = draft.intake
  async function generate() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await api('/clinical-assistant', {
        method: 'POST',
        body: { topic: 'Patient intake summary', context, mode: 'summary', reviewed: true },
      })
      setResult(
        [
          response.overview,
          response.safety.length ? `Concerns to review:\n${response.safety.join('\n')}` : '',
          response.uncertainties.length
            ? `Missing or uncertain:\n${response.uncertainties.join('\n')}`
            : '',
          response.questions.length ? `Clarify:\n${response.questions.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="intake-summary-editor">
      <h3>Patient assessment summary</h3>
      <p>
        Review the answers, then prepare a factual summary. Diagnosis remains the doctor's decision.
        You can also write the summary yourself.
      </p>
      <Field label="Summary for patient profile">
        <textarea
          rows={5}
          maxLength={10000}
          value={intake.summary}
          onChange={(e) => update('intake', { ...intake, summary: e.target.value })}
        />
      </Field>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => {
          setContext(intakeContext(draft))
          setReviewed(false)
          setResult(null)
        }}
      >
        <ClipboardList size={15} /> Prepare AI summary
      </button>
      {context !== null && (
        <div className="intake-ai-review">
          <Field
            label="Clinical information to send to Gemini"
            hint="Remove names and identifying information. Only this text is sent to Gemini."
          >
            <textarea
              rows={6}
              value={context}
              maxLength={14000}
              onChange={(e) => {
                setContext(e.target.value)
                setReviewed(false)
              }}
            />
          </Field>
          {context.length > 14000 && (
            <p className="form-error">
              Shorten the context to 14,000 characters before generating.
            </p>
          )}
          <label className="intake-required">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />{' '}
            I reviewed this text and removed identifying information.
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !reviewed || context.trim().length < 10 || context.length > 14000}
            onClick={generate}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : <ClipboardList size={15} />}{' '}
            Generate draft
          </button>
          {result && (
            <>
              <Field label="AI draft — review before using">
                <textarea
                  rows={7}
                  maxLength={10000}
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                />
              </Field>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  update('intake', { ...intake, summary: result })
                  setResult(null)
                  setContext(null)
                }}
              >
                Use reviewed summary
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p>
        Save the patient to keep the summary. Changing answers clears it so it can be reviewed
        again. If left blank, saving creates a factual answer overview automatically.
      </p>
    </section>
  )
}

export function IntakeProfile({ patient, onEdit }) {
  const intake = patient.intake
  if (!intake?.tabs?.length) return null
  return (
    <section className="panel intake-profile">
      <div className="intake-profile-heading">
        <h2>Patient assessment</h2>
        <button className="button secondary" onClick={onEdit}>
          Edit assessment
        </button>
      </div>
      {intake.summary ? (
        <p className="intake-saved-summary">{intake.summary}</p>
      ) : (
        <p>
          No assessment summary saved yet. Review the answers in Edit assessment to prepare one.
        </p>
      )}
      <details>
        <summary>View assessment answers</summary>
        {intake.tabs.map((tab) => (
          <section key={tab.id}>
            <h3>{tab.title}</h3>
            <dl>
              {tab.questions.map((q) => (
                <div key={q.id}>
                  <dt>{q.label}</dt>
                  <dd>{answerText(intake.answers[q.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </details>
    </section>
  )
}
