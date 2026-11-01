import test from 'node:test'
import assert from 'node:assert/strict'
import { createClinicalAssistant, clinicalInput } from '../server/clinical-assistant.js'

const input = {
  topic: 'shoulder pain',
  context: 'Pain with overhead activity; examination not yet performed.',
  reviewed: true,
}
const output = {
  overview: 'Assessment planning draft.',
  questions: ['Clarify onset.'],
  safety: ['Screen for red flags.'],
  assessments: [
    {
      name: 'Movement examination',
      purpose: 'Assess movement.',
      approach: 'Review active range as tolerated.',
      limitations: 'Not diagnostic alone.',
      sourceIds: ['123', 'invented'],
    },
  ],
  uncertainties: ['Limited history.'],
}
test('clinical input requires review and rejects patient identifiers as extra fields', () => {
  assert.equal(clinicalInput.safeParse({ ...input, reviewed: false }).success, false)
  assert.equal(clinicalInput.safeParse({ ...input, patientName: 'Private name' }).success, false)
})
test('clinical assistant keeps key in request header and allows only retrieved citation IDs', async () => {
  let geminiRequest
  const assistant = createClinicalAssistant({
    key: 'test-secret',
    fetcher: async (url, options) => {
      if (url.includes('esearch')) {
        assert.ok(!decodeURIComponent(url).includes(input.context))
        return Response.json({ esearchresult: { idlist: ['123'] } })
      }
      if (url.includes('esummary'))
        return Response.json({
          result: {
            123: { title: 'Real retrieved record', pubdate: '2025', fulljournalname: 'Journal' },
          },
        })
      if (url.includes('efetch')) return new Response('PMID: 123\nRelevant abstract.')
      geminiRequest = options
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } },
        ],
      })
    },
  })
  const result = await assistant(input)
  assert.deepEqual(result.assessments[0].sourceIds, ['123'])
  assert.equal(result.sources[0].url, 'https://pubmed.ncbi.nlm.nih.gov/123/')
  assert.equal('abstracts' in result.sources[0], false)
  assert.equal(geminiRequest.headers['x-goog-api-key'], 'test-secret')
  assert.ok(!geminiRequest.body.includes('test-secret'))
})
test('missing key and incomplete model responses fail without exposing secrets', async () => {
  await assert.rejects(createClinicalAssistant({})(input), (error) => error.status === 503)
  const assistant = createClinicalAssistant({
    key: 'secret',
    fetcher: async (url) => {
      if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: [] } })
      return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] })
    },
  })
  await assert.rejects(
    assistant(input),
    (error) => error.status === 502 && !error.message.includes('secret'),
  )
})
test('literature outages are explicit and never produce citation links', async () => {
  const assistant = createClinicalAssistant({
    key: 'secret',
    fetcher: async (url) => {
      if (!url.includes('googleapis.com')) throw new Error('offline')
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } },
        ],
      })
    },
  })
  const result = await assistant(input)
  assert.match(result.evidenceWarning, /could not be reached/)
  assert.deepEqual(result.sources, [])
  assert.deepEqual(result.assessments[0].sourceIds, [])
})
