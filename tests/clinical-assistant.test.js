import test from 'node:test'
import assert from 'node:assert/strict'
import { createClinicalAssistant, clinicalInput } from '../server/clinical-assistant.js'

test('model fallback moves from latest stable to older models on availability errors', async () => {
  const calls = []
  const assistant = createClinicalAssistant({
    key: 'secret',
    fetcher: async (url) => {
      if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: [] } })
      calls.push(decodeURIComponent(url.split('/models/')[1].split(':')[0]))
      if (calls.length === 1) return new Response('', { status: 404 })
      if (calls.length === 2) return new Response('', { status: 429 })
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } },
        ],
      })
    },
  })
  const result = await assistant(input)
  assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'])
  assert.equal(result.modelUsed, 'gemini-3.5-flash-lite')
})

test('authentication failures and safety blocks do not trigger model fallback', async () => {
  for (const blocked of [false, true]) {
    let attempts = 0
    const assistant = createClinicalAssistant({
      key: 'secret',
      fetcher: async (url) => {
        if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: [] } })
        attempts++
        return blocked
          ? Response.json({ candidates: [{ finishReason: 'SAFETY' }] })
          : new Response('', { status: 403 })
      },
    })
    await assert.rejects(assistant(input), (error) => error.status === (blocked ? 422 : 503))
    assert.equal(attempts, 1)
  }
})

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
  assert.equal(clinicalInput.safeParse({ ...input, mode: 'unknown' }).success, false)
  assert.equal(clinicalInput.safeParse({ ...input, reviewed: false }).success, false)
  assert.equal(clinicalInput.safeParse({ ...input, patientName: 'Private name' }).success, false)
})

test('treatment help uses exercise literature and a prompt that does not invent delivered care', async () => {
  let query = '',
    instructions = ''
  const assistant = createClinicalAssistant({
    key: 'test-secret',
    fetcher: async (url, options) => {
      if (url.includes('esearch')) {
        query = decodeURIComponent(url)
        return Response.json({ esearchresult: { idlist: [] } })
      }
      instructions = JSON.parse(options.body).systemInstruction.parts[0].text
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } },
        ],
      })
    },
  })
  await assistant({ ...input, mode: 'treatment' })
  assert.match(query, /exercise OR rehabilitation/)
  assert.match(instructions, /Never claim an exercise was performed/)
  assert.match(instructions, /Avoid prescribing a fixed exercise dose/)
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
    fallbackModels: [],
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

test('truncated and invalid structured output fall back before accepting a complete guide', async () => {
  let attempts = 0
  const assistant = createClinicalAssistant({
    key: 'secret',
    fetcher: async (url, options) => {
      if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: [] } })
      const config = JSON.parse(options.body).generationConfig
      assert.equal(config.thinkingConfig.thinkingLevel, 'low')
      attempts++
      if (attempts === 1)
        return Response.json({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{' }] } }],
        })
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: attempts === 2 ? '{}' : JSON.stringify(output) }] },
          },
        ],
      })
    },
  })
  const result = await assistant(input)
  assert.equal(attempts, 3)
  assert.equal(result.modelUsed, 'gemini-3.5-flash-lite')
  assert.equal(result.overview, output.overview)
})

test('quota exhaustion and invalid API keys produce actionable public errors', async () => {
  for (const status of [429, 400]) {
    const assistant = createClinicalAssistant({
      key: 'secret',
      fallbackModels: [],
      fetcher: async (url) => {
        if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: [] } })
        return Response.json(
          { error: { details: status === 400 ? [{ reason: 'API_KEY_INVALID' }] : [] } },
          { status },
        )
      },
    })
    await assert.rejects(
      assistant(input),
      (error) =>
        error.status === (status === 429 ? 429 : 503) &&
        (status === 429 ? /quota/.test(error.message) : /API key/.test(error.message)),
    )
  }
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
