import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createClinicalAssistant,
  clinicalInput,
  summaryOutput,
  normalizeGeminiModel,
} from '../server/clinical-assistant.js'

test('model fallback moves from latest stable to older models on availability errors', async () => {
  const calls = []
  const assistant = createClinicalAssistant({
    discoverModels: false,
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
      discoverModels: false,
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
    discoverModels: false,
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
    discoverModels: false,
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
  await assert.rejects(
    createClinicalAssistant({ discoverModels: false })(input),
    (error) => error.status === 503,
  )
  const assistant = createClinicalAssistant({
    discoverModels: false,
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
    discoverModels: false,
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
      discoverModels: false,
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
    discoverModels: false,
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

const summaryDraft = {
  sections: [
    { title: 'Clinical overview', summary: 'Recorded shoulder pain with overhead activity.' },
  ],
  painGuidance: [
    {
      painType: 'Shoulder pain',
      guidance: 'Review the recorded restrictions and pain-management plan.',
    },
  ],
  concerns: 'No concerns were documented in the supplied information.',
  uncertainties: 'Objective examination findings are not documented.',
}

test('intake summary uses reviewed case only and does not send questionnaire content to PubMed', async () => {
  const calls = []
  const assistant = createClinicalAssistant({
    discoverModels: false,
    key: 'secret',
    fetcher: async (url, options) => {
      calls.push(url)
      const body = JSON.parse(options.body)
      assert.match(body.systemInstruction.parts[0].text, /Never treat unanswered items as negative/)
      assert.match(body.systemInstruction.parts[0].text, /Do not infer a diagnosis/)
      assert.match(body.systemInstruction.parts[0].text, /Never ask follow-up questions/)
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(summaryDraft) }] } },
        ],
      })
    },
  })
  const result = await assistant({ ...input, mode: 'summary' })
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('generativelanguage.googleapis.com'))
  assert.deepEqual(result.sections, summaryDraft.sections)
  assert.deepEqual(result.painGuidance, summaryDraft.painGuidance)
})

test('summary output enforces short sections, text concerns and uncertainty, and no follow-up questions', () => {
  assert.equal(summaryOutput.safeParse(summaryDraft).success, true)
  assert.equal(
    summaryOutput.safeParse({ ...summaryDraft, uncertainties: 'What is the diagnosis?' }).success,
    false,
  )
  assert.equal(summaryOutput.safeParse({ ...summaryDraft, concerns: ['A concern'] }).success, false)
  assert.equal(
    summaryOutput.safeParse({
      ...summaryDraft,
      sections: [{ title: 'Overview', summary: 'x'.repeat(101) }],
    }).success,
    false,
  )
  assert.equal(
    summaryOutput.safeParse({
      ...summaryDraft,
      sections: [{ title: 'Overview', summary: 'x'.repeat(181) }],
    }).success,
    false,
  )
  assert.equal(
    summaryOutput.safeParse({ ...summaryDraft, concerns: 'x'.repeat(241) }).success,
    false,
  )
  assert.equal(
    summaryOutput.safeParse({ ...summaryDraft, concerns: 'x'.repeat(141) }).success,
    false,
  )
  assert.equal(
    summaryOutput.safeParse({
      ...summaryDraft,
      painGuidance: [{ painType: 'Pain', guidance: 'x'.repeat(121) }],
    }).success,
    false,
  )
  assert.equal(
    summaryOutput.safeParse({
      ...summaryDraft,
      sections: Array.from({ length: 11 }, (_, i) => ({
        title: `Section ${i}`,
        summary: 'x'.repeat(100),
      })),
      painGuidance: Array.from({ length: 3 }, () => ({
        painType: 'x'.repeat(80),
        guidance: 'x'.repeat(120),
      })),
    }).success,
    false,
  )
  assert.equal(summaryOutput.safeParse({ ...summaryDraft, questions: [] }).success, false)
  assert.equal(
    clinicalInput.safeParse({ ...input, mode: 'summary', context: 'x'.repeat(20000) }).success,
    true,
  )
  assert.equal(
    clinicalInput.safeParse({ ...input, mode: 'assessment', context: 'x'.repeat(20000) }).success,
    false,
  )
})

test('available-model discovery normalizes configured IDs, skips inaccessible models and caches the project model list', async () => {
  let listings = 0
  const generated = []
  const assistant = createClinicalAssistant({
    key: 'secret',
    model: 'models/removed-model',
    fallbackModels: ['models/gemini-2.5-flash-lite'],
    discoverModels: true,
    fetcher: async (url, options) => {
      if (url.includes('/models?')) {
        listings++
        return Response.json({
          models: [
            {
              name: 'models/gemini-2.5-flash-lite',
              supportedGenerationMethods: ['generateContent'],
            },
            {
              name: 'models/gemini-3.1-flash-image',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        })
      }
      generated.push(url)
      assert.deepEqual(JSON.parse(options.body).generationConfig.thinkingConfig, {
        thinkingBudget: 1024,
      })
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(summaryDraft) }] } },
        ],
      })
    },
  })
  for (let i = 0; i < 2; i++)
    await assistant({ ...input, mode: 'summary', reviewed: undefined, consented: true })
  assert.equal(listings, 1)
  assert.equal(generated.length, 2)
  assert.ok(generated.every((url) => url.includes('/models/gemini-2.5-flash-lite:generateContent')))
  assert.equal(normalizeGeminiModel(' models/gemini-2.5-flash-lite '), 'gemini-2.5-flash-lite')
})

test('stable model aliases work without generation-specific thinking parameters', async () => {
  const assistant = createClinicalAssistant({
    key: 'secret',
    model: 'unavailable-model',
    fallbackModels: [],
    discoverModels: true,
    fetcher: async (url, options) => {
      if (url.includes('/models?'))
        return Response.json({
          models: [
            { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
          ],
        })
      assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig, undefined)
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(summaryDraft) }] } },
        ],
      })
    },
  })
  const result = await assistant({
    ...input,
    mode: 'summary',
    reviewed: undefined,
    consented: true,
  })
  assert.equal(result.modelUsed, 'gemini-flash-latest')
})

test('a listed but inaccessible configured model falls back to the stable alias and is skipped on the next request', async () => {
  const generated = []
  const assistant = createClinicalAssistant({
    key: 'secret',
    model: 'gemini-3.8-flash',
    fallbackModels: [],
    discoverModels: true,
    fetcher: async (url) => {
      if (url.includes('/models?'))
        return Response.json({
          models: ['gemini-3.8-flash', 'gemini-flash-lite-latest'].map((name) => ({
            name: 'models/' + name,
            supportedGenerationMethods: ['generateContent'],
          })),
        })
      generated.push(url)
      if (url.includes('/gemini-3.8-flash:'))
        return Response.json(
          { error: { message: 'not available to this project' } },
          { status: 404 },
        )
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(summaryDraft) }] } },
        ],
      })
    },
  })
  await assistant({ ...input, mode: 'summary', consented: true })
  await assistant({ ...input, mode: 'summary', consented: true })
  assert.equal(generated.filter((url) => url.includes('/gemini-3.8-flash:')).length, 1)
  assert.equal(generated.filter((url) => url.includes('/gemini-flash-lite-latest:')).length, 2)
})
