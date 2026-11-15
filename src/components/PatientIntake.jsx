import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  ClipboardList,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '../lib/api'
import { Field } from './UI'
import Select from './Select'
import {
  templateFile,
  importTabs,
  parseTemplateJson,
  exampleTemplate,
  templateAuthoringPrompt,
} from '../lib/template-transfer'
import './PatientIntake.css'

const empty = () => ({ tabs: [], answers: {}, summary: '' })
const uid = () => crypto.randomUUID()
function IntakeCheckbox({ checked, onChange, children }) {
  return (
    <label className="intake-required">
      <span className="intake-checkbox-control">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <Check size={13} strokeWidth={3} aria-hidden="true" />
      </span>
      <span>{children}</span>
    </label>
  )
}
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
    patient.goals && `Treatment goals: ${patient.goals}`,
    patient.pain_management && `Pain management plan: ${patient.pain_management}`,
    ...data.tabs
      .filter((tab) => tab.questions.length > 0)
      .flatMap((tab) => [
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
  const [activeId, setActiveId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importMode, setImportMode] = useState('append')
  const [transferNotice, setTransferNotice] = useState('')
  const fileInput = useRef(null)
  const [pastedJson, setPastedJson] = useState('')
  const tabBar = useRef(null)
  const currentId = tabs.some((tab) => tab.id === activeId) ? activeId : tabs[0]?.id
  useEffect(() => {
    tabBar.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentId])
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
    setActiveId(currentId)
    const next = [...tabs]
    ;[next[index], next[index + direction]] = [next[index + direction], next[index]]
    change(next)
  }
  async function save(next = tabs) {
    for (const tab of next) {
      if (!tab.title.trim()) {
        setError('Give the current tab a name before continuing.')
        return false
      }
      for (const question of tab.questions) {
        if (
          !question.label.trim() ||
          (question.type === 'choice' &&
            (question.options.length < 2 ||
              question.options.some((value) => !value.trim()) ||
              new Set(question.options.map((value) => value.trim())).size !==
                question.options.length))
        ) {
          setError(
            'Complete each question and provide at least two distinct choices for choice questions before continuing.',
          )
          return false
        }
      }
    }
    setBusy(true)
    setError('')
    try {
      setTabs((await api('/intake-template', { method: 'PUT', body: { tabs: next } })).tabs)
      setDirty(false)
      onDirty?.(false)
      setSaved(true)
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  async function selectTab(id) {
    if (id === currentId) return
    if (dirty && !(await save())) return
    setActiveId(id)
  }
  async function addTab() {
    if (dirty && !(await save())) return
    const tab = { id: uid(), title: `Tab ${tabs.length + 1}`, questions: [] }
    if (await save([...tabs, tab])) setActiveId(tab.id)
  }
  async function deleteTab(tab) {
    if (
      !window.confirm(
        `Delete "${tab.title || 'Untitled tab'}" from your template? Existing patient assessments keep their saved questions and answers.`,
      )
    )
      return
    const next = tabs.filter((item) => item.id !== tab.id)
    if (await save(next)) setActiveId(currentId === tab.id ? (next[0]?.id ?? null) : currentId)
  }
  async function exportTemplate() {
    setBusy(true)
    setError('')
    setTransferNotice('')
    try {
      const data = await api('/intake-template/preview', {
        method: 'POST',
        body: templateFile(tabs),
      })
      const blob = new Blob([JSON.stringify(templateFile(data.tabs), null, 2)], {
        type: 'application/json',
      })
      if (blob.size > 80000)
        throw new Error('The export is too large to import. Reduce the template to below 80 KB.')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'physiomanager-assessment-tabs.json'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setTransferNotice('Tabs exported. The file includes question definitions only.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function readTemplate(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setPreview(null)
    setTransferNotice('')
    try {
      if (file.size > 80000) throw new Error('Choose a template JSON file smaller than 80 KB.')
      const document = parseTemplateJson(await file.text())
      const data = await api('/intake-template/preview', { method: 'POST', body: document })
      if (!data.tabs.length) throw new Error('This file has no tabs to import.')
      setPreview(data.tabs)
      setImportMode('append')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function previewPasted() {
    setBusy(true)
    setError('')
    setPreview(null)
    setTransferNotice('')
    try {
      const data = await api('/intake-template/preview', {
        method: 'POST',
        body: parseTemplateJson(pastedJson),
      })
      if (!data.tabs.length) throw new Error('The JSON has no tabs to import.')
      setPreview(data.tabs)
      setImportMode('append')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(templateAuthoringPrompt)
      setTransferNotice(
        'Prompt copied. Paste it into ChatGPT and replace the final line with your requirements.',
      )
    } catch {
      setTransferNotice('Select and copy the prompt from the field below.')
    }
  }
  function downloadExample() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exampleTemplate, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'physiomanager-template-example.json'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function applyImport() {
    if (
      importMode === 'replace' &&
      !window.confirm(
        'Replace all current template tabs, including unsaved edits? Saved patient assessments will stay unchanged.',
      )
    )
      return
    try {
      const next = importTabs(tabs, preview, importMode)
      if (await save(next)) {
        setActiveId(next[importMode === 'append' ? tabs.length : 0]?.id ?? null)
        setPreview(null)
        setTransferNotice('Assessment tabs imported and saved for your practice.')
      }
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <section className="intake-settings settings-section">
      <h3>Patient assessment templates</h3>
      <p>
        Create assessment tabs and questions inside Patient details. They appear under Assessments
        in Add/Edit patient. These are patient questionnaires, separate from the app navigation.
        Saved patient answers keep their original questions when you change the template.
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
        <div
          className="intake-tabs intake-template-tabs"
          aria-label="Assessment template tabs"
          ref={tabBar}
        >
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={tab.id === currentId ? 'selected' : ''}
              aria-pressed={tab.id === currentId}
              onClick={() => selectTab(tab.id)}
            >
              {tab.title || 'Untitled tab'}
            </button>
          ))}
          <button
            type="button"
            className="intake-new-tab"
            disabled={tabs.length >= 10}
            onClick={addTab}
          >
            <Plus size={15} /> Add tab
          </button>
        </div>
        <p className="intake-save-hint">Your current tab saves when you add or switch tabs.</p>
        {tabs.map(
          (tab, index) =>
            tab.id === currentId && (
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
                    aria-label={`Move tab ${index + 1} left`}
                    disabled={!index}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Move tab ${index + 1} right`}
                    disabled={index === tabs.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    aria-label={`Delete ${tab.title || 'untitled'} tab`}
                    onClick={() => deleteTab(tab)}
                  >
                    <Trash2 size={15} /> Remove tab
                  </button>
                </div>
                <table className="intake-table intake-template-table">
                  <caption className="visually-hidden">
                    Questions for {tab.title || 'this tab'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Question</th>
                      <th scope="col">Answer type / options</th>
                      <th scope="col">Settings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tab.questions.map((q, i) => (
                      <tr key={q.id}>
                        <td data-column="Question">
                          <Field label={`Question ${i + 1}`}>
                            <input
                              value={q.label}
                              maxLength={240}
                              onChange={(e) => questionChange(tab, q.id, { label: e.target.value })}
                            />
                          </Field>
                        </td>
                        <td data-column="Answer type / options">
                          <Field label={`Answer type for question ${i + 1}`}>
                            <Select
                              value={q.type}
                              onChange={(e) =>
                                questionChange(tab, q.id, {
                                  type: e.target.value,
                                  options:
                                    e.target.value === 'choice' ? ['Option 1', 'Option 2'] : [],
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
                        </td>
                        <td data-column="Settings">
                          <div className="intake-row-actions">
                            <IntakeCheckbox
                              checked={q.required}
                              onChange={(e) =>
                                questionChange(tab, q.id, { required: e.target.checked })
                              }
                            >
                              Required
                            </IntakeCheckbox>
                            <button
                              type="button"
                              className="intake-remove-question"
                              aria-label={`Remove question ${i + 1}`}
                              title="Remove question"
                              onClick={() =>
                                tabChange(tab.id, {
                                  questions: tab.questions.filter((item) => item.id !== q.id),
                                })
                              }
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="button secondary"
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
            ),
        )}
        <div className="intake-actions">
          <button type="button" className="button primary" disabled={!dirty} onClick={() => save()}>
            <Check size={15} /> Save template
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!tabs.length}
            onClick={exportTemplate}
          >
            <Download size={15} /> Export tabs
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} /> Import tabs
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Import assessment template file"
            onChange={readTemplate}
          />
        </div>
        <details className="intake-ai-options intake-template-helper">
          <summary>
            Create tabs with ChatGPT <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>
            Copy the prompt into ChatGPT and describe the tabs you want. Paste its JSON response
            below, preview the questions, then import. No patient information is needed.
          </p>
          <div className="intake-actions">
            <button type="button" className="button secondary" onClick={copyPrompt}>
              Copy ChatGPT prompt
            </button>
            <button type="button" className="button secondary" onClick={downloadExample}>
              <Download size={15} /> Download example JSON
            </button>
          </div>
          <Field label="Prompt for ChatGPT">
            <textarea
              readOnly
              rows={7}
              value={templateAuthoringPrompt}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <Field label="Paste template JSON">
            <textarea
              rows={7}
              maxLength={80000}
              value={pastedJson}
              onChange={(event) => setPastedJson(event.target.value)}
              placeholder="Paste the JSON response from ChatGPT"
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={!pastedJson.trim()}
            onClick={previewPasted}
          >
            Preview pasted tabs
          </button>
        </details>
        {preview && (
          <section className="intake-import-preview" aria-label="Import preview">
            <h4>Import preview</h4>
            <p>
              {preview.length} tabs · {preview.reduce((n, tab) => n + tab.questions.length, 0)}{' '}
              questions
            </p>
            <ul>
              {preview.map((tab) => (
                <li key={tab.id}>
                  {tab.title} — {tab.questions.length} questions
                </li>
              ))}
            </ul>
            <Field label="How to import">
              <Select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="append">Add to existing tabs</option>
                <option value="replace">Replace existing tabs</option>
              </Select>
            </Field>
            <p>Patient records and previously saved assessments are preserved.</p>
            <div className="intake-actions">
              <button type="button" className="button primary" onClick={applyImport}>
                <Check size={15} /> Import and save
              </button>
              <button type="button" className="button secondary" onClick={() => setPreview(null)}>
                Cancel import
              </button>
            </div>
          </section>
        )}
      </fieldset>
      {dirty && <p role="status">Template changes are not saved yet.</p>}
      {saved && <p role="status">Template saved for your practice.</p>}
      {transferNotice && <p role="status">{transferNotice}</p>}
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
  const assessmentTabs = intake.tabs.filter((tab) => tab.questions.length > 0)
  const activeAssessment = assessmentTabs.some((tab) => tab.id === active)
    ? active
    : assessmentTabs[0]?.id
  useEffect(() => {
    const form = container.current?.closest('form')
    const guard = (event) => {
      if (!ready) {
        event.preventDefault()
        event.stopPropagation()
        setError('Questions could not be loaded yet. Retry loading them before saving.')
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
      assessmentTabs.length &&
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
      <section className="patient-details-section" aria-labelledby="patient-details-title">
        <h2 id="patient-details-title">Patient details</h2>
        <div className="patient-core-details">{children}</div>
        <section
          className="patient-assessments-section"
          aria-labelledby="patient-assessments-title"
        >
          <div className="patient-assessments-heading">
            <h3 id="patient-assessments-title">Assessments</h3>
            <p>Questionnaires for this patient, using your practice's assessment templates.</p>
          </div>
          {loading && (
            <div className="intake-loading" role="status" aria-label="Loading assessment questions">
              <div className="intake-loading-label">
                <LoaderCircle size={17} className="spin" aria-hidden="true" />
                <span>Getting questions ready</span>
              </div>
              <div className="intake-skeleton-row" aria-hidden="true" />
              <div className="intake-skeleton-row" aria-hidden="true" />
              <div className="intake-skeleton-row" aria-hidden="true" />
            </div>
          )}
          {assessmentTabs.length > 0 && (
            <div
              className="intake-tabs patient-assessment-tabs"
              aria-label="Patient assessment tabs"
            >
              {assessmentTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  className={activeAssessment === tab.id ? 'selected' : ''}
                  aria-pressed={activeAssessment === tab.id}
                  onClick={() => setActive(tab.id)}
                >
                  {tab.title}
                </button>
              ))}
            </div>
          )}
          {assessmentTabs.map((tab) => (
            <section
              key={tab.id}
              hidden={activeAssessment !== tab.id}
              onInvalidCapture={() => setActive(tab.id)}
            >
              <h4 className="patient-assessment-title">{tab.title}</h4>
              <table className="intake-table intake-patient-table">
                <caption className="visually-hidden">{tab.title} questions and answers</caption>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {tab.questions.map((q) => (
                    <tr key={q.id}>
                      <th scope="row">
                        {q.label}
                        {q.required ? ' *' : ''}
                      </th>
                      <td>
                        <Field label={`${q.label}${q.required ? ' *' : ''}`}>
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
                              value={
                                intake.answers[q.id] == null ? '' : String(intake.answers[q.id])
                              }
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
                              {(q.type === 'boolean' ? ['true', 'false'] : q.options).map(
                                (value) => (
                                  <option value={value} key={value}>
                                    {q.type === 'boolean'
                                      ? value === 'true'
                                        ? 'Yes'
                                        : 'No'
                                      : value}
                                  </option>
                                ),
                              )}
                            </Select>
                          )}
                        </Field>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {(error || (draft.id && assessmentTabs.length === 0)) && (
            <div className="intake-actions">
              <button className="text-link" type="button" disabled={loading} onClick={latest}>
                {error ? 'Retry loading questions' : 'Add assessment questions'}
              </button>
            </div>
          )}
          {assessmentTabs.length > 0 && (
            <IntakeSummary key={intakeContext(draft)} draft={draft} update={update} />
          )}
        </section>
        <section className="patient-goals-section">
          <Field label="Treatment goals">
            <textarea
              rows={3}
              maxLength={10000}
              value={draft.goals || ''}
              onChange={(event) => update('goals', event.target.value)}
              placeholder="What would the patient like to get back to?"
            />
          </Field>
        </section>
      </section>
    </div>
  )
}

function IntakeSummary({ draft, update }) {
  const [context, setContext] = useState(() => intakeContext(draft))
  const [aiOpen, setAiOpen] = useState(false)
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
        Saving the patient creates an answer overview automatically. Add your own notes here if
        needed.
      </p>
      <Field label="Summary for patient profile">
        <textarea
          rows={5}
          maxLength={10000}
          value={intake.summary}
          onChange={(e) => update('intake', { ...intake, summary: e.target.value })}
        />
      </Field>
      <details
        className="intake-ai-options"
        open={aiOpen}
        onToggle={(event) => setAiOpen(event.currentTarget.open)}
      >
        <summary>
          AI summary <span>Optional</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <p>
          Use Gemini to turn these answers into a readable draft. Review what is sent, then check
          the generated text before saving. The recorded diagnosis stays under your control.
        </p>
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
          <IntakeCheckbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)}>
            I reviewed this text and removed identifying information.
          </IntakeCheckbox>
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
                  setAiOpen(false)
                }}
              >
                Use reviewed summary
              </button>
            </>
          )}
        </div>
      </details>
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
  if (!intake?.tabs?.some((tab) => tab.questions.length > 0)) return null
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
        {intake.tabs
          .filter((tab) => tab.questions.length > 0)
          .map((tab) => (
            <section key={tab.id}>
              <h3>{tab.title}</h3>
              <table className="intake-table intake-patient-table">
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {tab.questions.map((q) => (
                    <tr key={q.id}>
                      <th scope="row">{q.label}</th>
                      <td>{answerText(intake.answers[q.id])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
      </details>
    </section>
  )
}
