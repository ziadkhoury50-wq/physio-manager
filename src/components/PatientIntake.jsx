import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
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
  templateInstructions,
} from '../lib/template-transfer'
import './PatientIntake.css'
import {
  patientSummaryContext,
  summaryBullets,
  formatPatientSummary,
  summarySections,
} from '../lib/patient-summary'

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
  const [aiResponse, setAiResponse] = useState('')
  const [previewSource, setPreviewSource] = useState('file')
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
      setPreviewSource('file')
      setImportMode('append')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function previewAiResponse() {
    setBusy(true)
    setError('')
    setPreview(null)
    setTransferNotice('')
    try {
      const data = await api('/intake-template/preview', {
        method: 'POST',
        body: parseTemplateJson(aiResponse),
      })
      if (!data.tabs.length) throw new Error('The AI response has no assessment tabs.')
      setPreview(data.tabs)
      setPreviewSource('ai')
      setImportMode('append')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function copyAiInstructions() {
    try {
      await navigator.clipboard.writeText(templateInstructions(tabs))
      setTransferNotice(
        'Instructions copied. Use them with any AI tool, then paste its response below.',
      )
    } catch {
      setTransferNotice('Open View instructions below to select and copy them manually.')
    }
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
      if (JSON.stringify(next) === JSON.stringify(tabs)) {
        setTransferNotice('These tabs and questions already exist. Nothing was added.')
        setPreview(null)
        return
      }
      if (await save(next)) {
        setActiveId(
          next.find((tab) => !tabs.some((old) => old.id === tab.id))?.id ?? next[0]?.id ?? null,
        )
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
        </div>
        <details className="intake-ai-options intake-template-helper">
          <summary>
            Create tabs with AI <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>
            Build your questionnaire with any AI tool, then review the questions here before saving.
          </p>
          <ol className="intake-ai-steps">
            <li>
              <strong>Copy the instructions</strong>
              <span>They tell your AI tool how to format the tabs and questions.</span>
            </li>
            <li>
              <strong>Describe what you need</strong>
              <span>
                Paste the instructions into your AI tool and describe your assessments. Use template
                details only, without patient information.
              </span>
            </li>
            <li>
              <strong>Paste and review</strong>
              <span>
                Paste its complete response below, preview the questions, then add them to your
                template.
              </span>
            </li>
          </ol>
          <button type="button" className="button secondary" onClick={copyAiInstructions}>
            <Copy size={15} aria-hidden="true" />
            Copy AI instructions
          </button>
          <details className="intake-copy-instructions">
            <summary>
              View instructions <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <p>
              These instructions are ready to copy. If the copy button is unavailable, select the
              text below and copy it.
            </p>
            <Field
              label="Instructions for your AI tool"
              hint="Tap or click the text to select all instructions."
            >
              <textarea
                rows={7}
                readOnly
                value={templateInstructions(tabs)}
                onFocus={(event) => event.target.select()}
              />
            </Field>
          </details>
          <Field label="Paste AI response">
            <textarea
              rows={5}
              maxLength={80000}
              value={aiResponse}
              onChange={(event) => setAiResponse(event.target.value)}
              placeholder="Paste the complete response from your preferred AI tool"
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={!aiResponse.trim()}
            onClick={previewAiResponse}
          >
            Preview tabs
          </button>
        </details>
        <details className="intake-ai-options intake-transfer-options">
          <summary>
            Import or export templates <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>Optional: transfer a template between doctors' apps using a saved file.</p>
          <div className="intake-actions">
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
        </details>
        {preview && (
          <section className="intake-import-preview" aria-label="Import preview">
            <h4>{previewSource === 'ai' ? 'Review generated tabs' : 'Import preview'}</h4>
            <p>
              {preview.length} tabs · {preview.reduce((n, tab) => n + tab.questions.length, 0)}{' '}
              questions
            </p>
            <ul>
              {preview.map((tab) => (
                <li key={tab.id}>
                  <details>
                    <summary>
                      {tab.title} · {tab.questions.length} questions
                      <ChevronDown className="disclosure-chevron" size={16} aria-hidden="true" />
                    </summary>
                    <ul>
                      {tab.questions.map((q) => (
                        <li key={q.id}>
                          {q.label}{' '}
                          <small>
                            (
                            {
                              {
                                boolean: 'Yes / No',
                                text: 'Text',
                                number: 'Number',
                                choice: 'Choice',
                              }[q.type]
                            }
                            )
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
            <Field label="How to import">
              <Select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="append">Add to existing tabs</option>
                <option value="replace">Replace existing tabs</option>
              </Select>
            </Field>
            <p>
              Matching tab names are merged. Existing questions are skipped, and conflicting answer
              types or choices stop the import for review. Patient records keep their saved
              assessments.
            </p>
            <div className="intake-actions">
              <button type="button" className="button primary" onClick={applyImport}>
                <Check size={15} /> {previewSource === 'ai' ? 'Use these tabs' : 'Import and save'}
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

export function PatientIntakeForm({ draft, update, children, sessions = [] }) {
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
            <IntakeSummary
              key={patientSummaryContext(draft, sessions)}
              draft={draft}
              update={update}
              sessions={sessions}
            />
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

function IntakeSummary({ draft, update, sessions }) {
  const [context, setContext] = useState(() => patientSummaryContext(draft, sessions))
  const [generated, setGenerated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const intake = draft.intake
  async function generate() {
    setBusy(true)
    setError('')
    setGenerated(false)
    try {
      const response = await api('/clinical-assistant', {
        method: 'POST',
        body: { topic: 'Patient intake summary', context, mode: 'summary', consented: true },
      })
      update('intake', { ...intake, summary: formatPatientSummary(response) })
      setGenerated(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="intake-summary-editor">
      <h3>Patient assessment summary</h3>
      <p>Generate a brief clinical summary, review it below, then save the patient.</p>
      <div className="intake-summary-action">
        <button
          type="button"
          className="button secondary"
          disabled={busy || context.trim().length < 10 || context.length > 200000}
          onClick={generate}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <ClipboardList size={16} />}
          {busy ? 'Generating summary?' : 'Generate summary'}
        </button>
        <p>
          Uses the clinical profile, assessment answers and visit notes. Clicking Generate sends
          this information to Gemini; name, contact and payment fields are excluded.
        </p>
      </div>
      {generated && <p role="status">Summary generated. Review it below, then save the patient.</p>}
      <Field label="Summary for patient profile">
        <textarea
          rows={5}
          maxLength={10000}
          value={intake.summary}
          onChange={(e) => update('intake', { ...intake, summary: e.target.value })}
        />
      </Field>
      <details className="intake-ai-options intake-summary-context">
        <summary>
          Review information shared <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <p>Remove any identifying information within clinical notes if needed.</p>
        <Field label="Clinical information to share">
          <textarea
            rows={5}
            maxLength={200000}
            value={context}
            onChange={(event) => setContext(event.target.value)}
          />
        </Field>
      </details>
      {context.length > 200000 && (
        <p className="form-error">
          This record is too large for one AI request. Open Review information shared to shorten it.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p>Save patient keeps this summary in the patient profile.</p>
    </section>
  )
}

export function IntakeProfile({ patient, onEdit }) {
  const intake = patient.intake
  if (!intake?.tabs?.some((tab) => tab.questions.length > 0)) return null
  const structured = summarySections(intake.summary || '')
  const [overview, ...details] = structured || []
  return (
    <section className="panel intake-profile">
      <div className="intake-profile-heading">
        <h2>Patient assessment</h2>
        <button className="button secondary" onClick={onEdit}>
          Edit assessment
        </button>
      </div>
      {intake.summary ? (
        structured ? (
          <>
            {overview && (
              <div className="intake-saved-summary intake-overview">
                <ul>
                  {(overview.bullets || overview.text.split(/(?<=[.!])\s+(?=[A-Z0-9])/)).map(
                    (point, index) => (
                      <li key={index}>{point}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
            {details.length > 0 && (
              <details className="intake-full-summary">
                <summary>
                  View clinical details <span>({details.length} sections)</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <div className="intake-saved-summary intake-structured-summary">
                  {details.map((section, index) => (
                    <SummarySection section={section} key={index} />
                  ))}
                </div>
              </details>
            )}
          </>
        ) : summaryBullets(intake.summary) ? (
          <>
            <ul className="intake-saved-summary intake-summary-bullets">
              {summaryBullets(intake.summary)
                .slice(0, 2)
                .map((bullet, index) => (
                  <li key={index}>{bullet}</li>
                ))}
            </ul>
            {summaryBullets(intake.summary).length > 2 && (
              <details className="intake-full-summary">
                <summary>
                  View full summary <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <ul className="intake-saved-summary intake-summary-bullets">
                  {summaryBullets(intake.summary)
                    .slice(2)
                    .map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <>
            <p className="intake-saved-summary intake-summary-legacy-preview">{intake.summary}</p>
            {intake.summary.length > 240 && (
              <details className="intake-full-summary">
                <summary>
                  View full summary <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <p className="intake-saved-summary">{intake.summary}</p>
              </details>
            )}
          </>
        )
      ) : (
        <p>
          No assessment summary saved yet. Review the answers in Edit assessment to prepare one.
        </p>
      )}
      <details className="intake-answer-details">
        <summary>
          View assessment answers <ChevronDown size={16} aria-hidden="true" />
        </summary>
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

function SummarySection({ section }) {
  return (
    <section className="intake-summary-section">
      <h3>{section.title}</h3>
      {section.bullets ? (
        <ul>
          {section.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      ) : (
        <p>{section.text}</p>
      )}
    </section>
  )
}
