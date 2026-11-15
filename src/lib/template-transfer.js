export function templateFile(tabs) {
  return { format: 'physiomanager-assessment-tabs', version: 1, tabs }
}
export function parseTemplateJson(text) {
  if (new TextEncoder().encode(text).length > 80000)
    throw new Error('Use template JSON smaller than 80 KB.')
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error(
      'This is not valid JSON. Paste the JSON template returned by your AI tool or choose an exported template file.',
    )
  }
}

export const exampleTemplate = templateFile([
  {
    id: 'initial-assessment',
    title: 'Initial assessment',
    questions: [
      {
        id: 'night-pain',
        label: 'Does the patient report pain at night?',
        type: 'boolean',
        required: false,
        options: [],
      },
      {
        id: 'symptom-description',
        label: 'How does the patient describe their symptoms?',
        type: 'text',
        required: false,
        options: [],
      },
      {
        id: 'reported-pain',
        label: 'Reported pain score (0–10)',
        type: 'number',
        required: false,
        options: [],
      },
      {
        id: 'affected-side',
        label: 'Which side is affected?',
        type: 'choice',
        required: false,
        options: ['Left', 'Right', 'Both', 'Not applicable'],
      },
    ],
  },
])

export const templateAuthoringPrompt = `Create a reusable patient assessment questionnaire for a physiotherapist. I will describe the topics below.
Return ONLY valid JSON, without Markdown fences, explanations, patient answers, example patient records or any identifying information. This is a blank questionnaire for clinician use, not a diagnosis or a scoring algorithm.

Use exactly this file structure:
${JSON.stringify(exampleTemplate, null, 2)}

Rules:
- Keep format exactly "physiomanager-assessment-tabs" and version exactly 1.
- Root keys: format, version, tabs. No additional keys anywhere.
- Each tab has id, title, questions. Each question has id, label, type, required, options.
- IDs must be unique across ALL tabs and questions, contain only letters, digits, underscores or hyphens, and be 1–80 characters. Use meaningful IDs.
- At most 10 tabs. There is no fixed question-count limit per tab or overall; keep the total file below 80 KB. Include at least one question per tab.
- Tab titles: 1–80 characters. Question labels: 1–240 characters.
- type is exactly boolean, text, number or choice.
- boolean means Yes / No; text is a free-text answer; number is a numeric answer; choice is a single selection.
- required is a JSON boolean true or false, not a quoted string. Prefer false unless I request a required answer.
- For boolean, text and number, options must be []. For choice, provide 2–12 distinct, nonempty string options, each at most 100 characters.
- Do not include answers, scores, clinical findings, recommendations, conditions, visibility rules, IDs from real patients or any unsupported fields.
- Do not imply that this form makes a diagnosis or is a validated questionnaire. If I request a named validated instrument, do not invent its items or scoring; ask me for an authorized source instead.
- Keep the output file below 80 KB.

Build the tabs and questions for this request (replace this line with my requirements):
[Describe the assessment topics, tab names and any specific questions or answer types I want.]`

export function importTabs(existing, incoming, mode, newId = () => crypto.randomUUID()) {
  if (!['append', 'replace'].includes(mode)) throw new Error('Choose how to import the tabs.')
  const imported = incoming.map((tab) => ({
    ...tab,
    id: newId(),
    questions: tab.questions.map((question) => ({ ...question, id: newId() })),
  }))
  const tabs = mode === 'append' ? [...existing, ...imported] : imported
  if (tabs.length > 10)
    throw new Error(
      'The combined template exceeds 10 tabs. Import fewer tabs or choose Replace existing tabs.',
    )
  return tabs
}
