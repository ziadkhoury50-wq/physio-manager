import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockWorkspace } from '../fixtures/mock-workspace.js'

test.beforeEach(async ({ page }) => {
  await mockWorkspace(page)
})

test('session amounts persist and dashboard totals follow edits and cleared amounts', async ({
  page,
}) => {
  await page.goto('/#/dashboard')
  await expect(page.getByRole('heading', { name: 'Your work, at a glance.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No amounts recorded yet' })).toBeVisible()
  await noOverflow(page)
  await tab(page, 'Sessions')
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Record session', exact: true })
    .click()
  await chooseOption(page, 'Patient *', 'Nadia Farah')
  await page.getByLabel('Session amount (USD)', { exact: true }).fill('45.25')
  await page.getByLabel('Treatment performed *', { exact: true }).fill('Revenue assessment')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await tab(page, 'Dashboard')
  await expect(page.locator('.dashboard-metric').first()).toContainText('$45.25')
  await expect(page.getByRole('list', { name: 'Recorded revenue by period' })).toBeVisible()
  await noOverflow(page)
  await page.locator('.dashboard-session-row').first().click()
  await expect(page.getByRole('dialog')).toContainText('Session amount: $45.25')
  await page.getByRole('button', { name: 'Edit session', exact: true }).click()
  await expect(page.getByLabel('Session amount (USD)', { exact: true })).toHaveValue('45.25')
  await page.getByLabel('Session amount (USD)', { exact: true }).fill('0.10')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await expect(page.locator('.dashboard-metric').first()).toContainText('$0.10')
  await page.locator('.dashboard-session-row').first().click()
  await page.getByRole('button', { name: 'Edit session', exact: true }).click()
  await page.getByLabel('Session amount (USD)', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await page.reload()
  await expect(page.locator('.dashboard-metric').first()).toContainText('$0.00')
  await expect(page.getByRole('heading', { name: 'No amounts recorded yet' })).toBeVisible()
  await chooseOption(page, 'Period', 'All time')
  await noOverflow(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('clinical assistant previews context, requires review and only adds ideas on request', async ({
  page,
}) => {
  let submitted
  await page.route('**/api/clinical-assistant', async (route) => {
    submitted = route.request().postDataJSON()
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        overview: 'Review range of movement before choosing tests.',
        questions: ['Clarify symptom onset.'],
        safety: ['Review referral indicators.'],
        assessments: [
          {
            name: 'Active movement review',
            purpose: 'Observe tolerated movement.',
            approach: 'Assess as tolerated.',
            limitations: 'Not diagnostic alone.',
            sourceIds: ['123'],
          },
        ],
        uncertainties: ['History is incomplete.'],
        evidenceWarning: '',
        sources: [
          {
            id: '123',
            title: 'Retrieved assessment review',
            journal: 'Test journal',
            date: '2025',
            url: 'https://pubmed.ncbi.nlm.nih.gov/123/',
          },
        ],
      }),
    })
  })
  await page.goto('/#/sessions')
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Record session', exact: true })
    .click()
  await chooseOption(page, 'Patient *', 'Nadia Farah')
  await page.getByRole('button', { name: /Assessment ideas/ }).click()
  const summary = page.getByRole('textbox', { name: 'Clinical summary to share' })
  await expect(summary).toContainText('')
  expect(await summary.inputValue()).toContain('Rotator cuff rehabilitation')
  expect(await summary.inputValue()).not.toContain('+961')
  expect(await summary.inputValue()).not.toContain('Nadia Farah')
  await expect(
    page.getByRole('button', { name: 'Suggest assessments', exact: true }),
  ).toBeDisabled()
  await page.getByRole('checkbox', { name: /I reviewed both fields/ }).check()
  await page.getByRole('button', { name: 'Suggest assessments', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Candidate assessments', exact: true }),
  ).toBeVisible()
  expect(submitted.reviewed).toBe(true)
  await expect(page.getByLabel('Next-session plan', { exact: true })).toHaveValue('')
  await noOverflow(page)
  await page.getByRole('button', { name: 'Add idea to session plan', exact: true }).click()
  await expect(page.getByLabel('Next-session plan', { exact: true })).toHaveValue(
    /Assessment idea for clinician review: Active movement review/,
  )
  await page.getByRole('button', { name: 'Add full guide to session plan', exact: true }).click()
  await expect(page.getByLabel('Next-session plan', { exact: true })).toHaveValue(
    /https:\/\/pubmed.ncbi.nlm.nih.gov\/123\//,
  )
  await page
    .getByLabel('Symptoms / how the patient feels', { exact: true })
    .fill('Stiffness with reaching.')
  await page.getByRole('spinbutton', { name: /Pain score/ }).fill('0')
  await page
    .getByLabel('Treatment performed *', { exact: true })
    .fill('Reviewed assessment and mobility work.')
  await page
    .getByLabel('Progress / response', { exact: true })
    .fill('Tolerated movement comfortably.')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await page.reload()
  await page
    .locator('.session-card')
    .filter({ hasText: 'Reviewed assessment and mobility work.' })
    .click()
  await expect(page.getByRole('dialog')).toContainText('Nadia Farah')
  await expect(page.getByRole('dialog')).toContainText('Pain score: 0/10')
  for (const text of [
    'Stiffness with reaching.',
    'Reviewed assessment and mobility work.',
    'Tolerated movement comfortably.',
    'Clarify symptom onset.',
    'Review referral indicators.',
    'Assess as tolerated.',
    'Not diagnostic alone.',
    'History is incomplete.',
    'Retrieved assessment review',
    'https://pubmed.ncbi.nlm.nih.gov/123/',
  ]) {
    await expect(page.getByRole('dialog').locator('.session-detail')).toContainText(text)
  }
  await noOverflow(page)
})

test('deleting sessions and patients confirms intent, preserves failed deletes and cleans related records', async ({
  page,
}) => {
  await page.goto('/#/patients/demo-1')
  await expect(page.locator('.session-card')).toHaveCount(2)
  await page.locator('.session-card').first().click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete session', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  let fail = true
  await page.route('**/api/sessions/*', (route) =>
    fail && route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Deletion test failure.' }),
        })
      : route.fallback(),
  )
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete session', exact: true }).click()
  await expect(page.getByText('Deletion test failure.', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  fail = false
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete session', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.reload()
  await expect(page.locator('.session-card')).toHaveCount(1)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
  await expect(page.locator('.profile-heading h1')).toHaveText('Nadia Farah')
  await noOverflow(page)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete patient', exact: true }).click()
  await expect(page.locator('.patient-card')).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.patient-card')).toHaveCount(3)
  await tab(page, 'Sessions')
  await expect(page.locator('.session-card')).toHaveCount(1)
  await expect(page.locator('.session-card')).toContainText('Omar Haddad')
  await tab(page, 'Calendar')
  await expect(page.locator('.appointment')).toHaveCount(4)
  await expect(page.locator('.appointment').filter({ hasText: 'Nadia Farah' })).toContainText(
    'GOOGLE CALENDAR',
  )
})

async function tab(page, name) {
  const mobile = await page.getByRole('navigation', { name: 'Mobile navigation' }).isVisible()
  await page
    .getByRole('navigation', {
      name: mobile ? 'Mobile navigation' : 'Main navigation',
      exact: true,
    })
    .getByRole('link', { name, exact: true })
    .click()
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}
async function chooseOption(page, label, name) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

test('calendar, navigation, date controls, and responsive layouts work without runtime errors', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your calendar.' })).toBeVisible()
  await expect(page.locator('.appointment')).toHaveCount(4)
  await noOverflow(page)
  await page.getByRole('button', { name: 'Next week', exact: true }).click()
  await expect(page.getByText('No appointments for this day.')).toBeVisible()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await expect(page.locator('.appointment')).toHaveCount(4)
  await tab(page, 'Patients')
  await expect(page.locator('.patient-card')).toHaveCount(4)
  await noOverflow(page)
  await page.getByRole('textbox', { name: 'Search patients' }).fill('Nadia')
  await expect(page.locator('.patient-card')).toHaveCount(1)
  await tab(page, 'Sessions')
  await expect(page.locator('.session-card')).toHaveCount(3)
  await noOverflow(page)
  expect(errors).toEqual([])
})

test('create, edit, archive, and restore a patient without losing history', async ({ page }) => {
  await page.goto('/#/patients')
  await page.getByRole('button', { name: 'New patient', exact: true }).click()
  await page.getByLabel('Full name *', { exact: true }).fill('Maya Test')
  await expect(page.getByLabel('Email address', { exact: true })).toHaveCount(0)
  await page.getByLabel('Referred by', { exact: true }).fill('Dr. Referral')
  await page
    .getByLabel('Underlying conditions', { exact: true })
    .fill('Recorded underlying condition')
  await page.getByLabel('Medication', { exact: true }).fill('Recorded medication')
  await page.getByLabel('Presenting condition', { exact: true }).fill('Ankle rehabilitation')
  await page
    .getByLabel('Relevant history', { exact: true })
    .fill('Returning after an ankle injury.')
  await page.getByRole('button', { name: 'Save patient', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Maya Test', exact: true })).toBeVisible()
  await expect(page.getByText('Returning after an ankle injury.', { exact: true })).toBeVisible()
  await expect(page.getByText('Dr. Referral', { exact: true })).toBeVisible()
  await expect(page.getByText('Recorded underlying condition', { exact: true })).toBeVisible()
  await expect(page.getByText('Recorded medication', { exact: true })).toBeVisible()
  await noOverflow(page)
  await page.getByRole('button', { name: 'Edit patient', exact: true }).click()
  await page.getByLabel('Treatment goals', { exact: true }).fill('Walk comfortably.')
  await page.getByRole('button', { name: 'Save patient', exact: true }).click()
  await expect(page.getByText('Walk comfortably.', { exact: true })).toBeVisible()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Archive patient', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restore patient', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'All patients', exact: true }).click()
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  await page.getByRole('link', { name: /Maya Test/ }).click()
  await expect(page.getByText('Walk comfortably.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restore patient', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Archive patient', exact: true })).toBeVisible()
})

test('record, review, and edit a session including zero pain score', async ({ page }) => {
  await page.goto('/#/patients/demo-1')
  await noOverflow(page)
  await page.getByRole('button', { name: 'Record session', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Patient *', exact: true })).toContainText(
    'Nadia Farah',
  )
  await page
    .getByLabel('Treatment performed *', { exact: true })
    .fill('Guided movement and strengthening.')
  await page.getByLabel('Pain score (optional, 0–10)', { exact: true }).fill('0')
  await page.getByLabel('Next-session plan', { exact: true }).fill('Review mobility next week.')
  await noOverflow(page)
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await page.getByRole('button').filter({ hasText: 'Guided movement and strengthening.' }).click()
  await expect(page.getByText('Pain score: 0/10', { exact: true })).toBeVisible()
  await expect(page.getByText('Review mobility next week.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit session', exact: true }).click()
  await page.getByLabel('Progress / response', { exact: true }).fill('Comfortable throughout.')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await tab(page, 'Sessions')
  await page.getByRole('textbox', { name: 'Search sessions' }).fill('Guided movement')
  await expect(page.locator('.session-card')).toHaveCount(1)
  await page.locator('.session-card').click()
  await expect(page.getByText('Comfortable throughout.', { exact: true })).toBeVisible()
})

test('link an existing calendar event and record a session without changing the event', async ({
  page,
}) => {
  await page.goto('/')
  await page.locator('.appointment').filter({ hasText: 'Lina Tabet' }).click()
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Record session', exact: true }),
  ).toBeDisabled()
  await chooseOption(page, 'Link to a patient', 'Lina Tabet')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Record session', exact: true })
    .click()
  await expect(page.getByRole('combobox', { name: 'Patient *', exact: true })).toContainText(
    'Lina Tabet',
  )
  await page.getByLabel('Treatment performed *', { exact: true }).fill('Initial knee assessment.')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await expect(
    page.locator('.appointment').filter({ hasText: 'Lina Tabet' }).locator('.appointment-link'),
  ).toContainText('Lina Tabet')
  await expect(page.locator('.appointment').filter({ hasText: 'Lina Tabet' })).toContainText(
    'Initial assessment',
  )
  await page
    .locator('.appointment')
    .filter({ hasText: 'Lina Tabet' })
    .locator('.appointment-main')
    .click()
  await expect(page.getByText('PATIENT PROFILE', { exact: true })).toBeVisible()
  await expect(page.locator('.profile-heading h1')).toHaveText('Lina Tabet')
  await tab(page, 'Calendar')
  await page
    .locator('.appointment')
    .filter({ hasText: 'Lina Tabet' })
    .locator('.appointment-details')
    .click()
  await chooseOption(page, 'Link to a patient', 'No patient linked')
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Record session', exact: true }),
  ).toBeDisabled()
})

test('unsaved changes are protected and clinical records never enter local storage', async ({
  page,
}) => {
  await page.goto('/#/patients')
  await page.getByRole('button', { name: 'New patient', exact: true }).click()
  await page.getByLabel('Full name *', { exact: true }).fill('Unsaved Test Patient')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByLabel('Full name *', { exact: true })).toHaveValue('Unsaved Test Patient')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(stored).not.toContain('Nadia')
  expect(stored).not.toContain('Unsaved Test Patient')
  await expect(page.getByText('Design preview', { exact: true })).toHaveCount(0)
})

test('patient and session validation prevents invalid saves', async ({ page }) => {
  await page.goto('/#/patients')
  await page.getByRole('button', { name: 'New patient', exact: true }).click()
  await page.getByLabel('Full name *', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Save patient', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('enter the patient')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await tab(page, 'Sessions')
  await page.getByRole('button', { name: 'Record session', exact: true }).click()
  await chooseOption(page, 'Patient *', 'Nadia Farah')
  await page.getByLabel('Treatment performed *', { exact: true }).fill('Mobility work')
  await page.getByLabel('Pain score (optional, 0–10)', { exact: true }).fill('11')
  await page.getByRole('button', { name: 'Save session', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(
    await page
      .getByLabel('Pain score (optional, 0–10)', { exact: true })
      .evaluate((input) => input.validity.rangeOverflow),
  ).toBe(true)
})

test('main screens and forms meet automated accessibility checks', async ({ page }) => {
  test.setTimeout(60000)
  for (const route of ['/calendar', '/patients', '/patients/demo-1', '/sessions']) {
    await page.goto(`/#${route}`)
    if (route === '/calendar') await expect(page.locator('.appointment')).toHaveCount(4)
    else if (route === '/patients') await expect(page.locator('.patient-card')).toHaveCount(4)
    else if (route === '/patients/demo-1')
      await expect(
        page.getByRole('heading', { name: 'Nadia Farah', exact: true, level: 1 }),
      ).toBeVisible()
    else await expect(page.locator('.session-card')).toHaveCount(3)
    await page.evaluate(() => document.fonts.ready)
    await noOverflow(page)
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(result.violations, `Accessibility issues on ${route}`).toEqual([])
    const otherFonts = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          'h1,h2,h3,p,a,button,label,input,textarea,select,span,small,strong,dt,dd',
        ),
      )
        .filter(
          (element) =>
            element.getBoundingClientRect().width > 0 &&
            !getComputedStyle(element).fontFamily.includes('Outfit'),
        )
        .map((element) => ({
          tag: element.tagName,
          text: element.textContent.slice(0, 40),
          font: getComputedStyle(element).fontFamily,
        })),
    )
    expect(otherFonts, `Font consistency on ${route}`).toEqual([])
  }
  await page.getByRole('button', { name: 'Record session', exact: true }).click()
  const formResult = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(formResult.violations).toEqual([])
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Outfit')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).toBe(
    'none',
  )
})

test('a new practice starts empty with no sample records or calendar events', async ({ page }) => {
  await page.route('**/api/records', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ patients: [], sessions: [], links: [] }),
    }),
  )
  await page.route('**/api/calendar/status', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connected: false }) }),
  )
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Connect your calendar', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.appointment')).toHaveCount(0)
  await tab(page, 'Patients')
  await expect(page.locator('.patient-card')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Your care starts here', exact: true }),
  ).toBeVisible()
  await tab(page, 'Sessions')
  await expect(page.locator('.session-card')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Make room for progress', exact: true }),
  ).toBeVisible()
})

test('selects have white menus, separators, keyboard support, and work inside mobile dialogs', async ({
  page,
}) => {
  await page.goto('/#/patients/demo-1')
  await page.getByRole('button', { name: 'Record session', exact: true }).click()
  const patientSelect = page.getByRole('combobox', { name: 'Patient *', exact: true })
  await patientSelect.click()
  const menu = page.getByRole('listbox')
  await expect(menu).toBeVisible()
  expect(await menu.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgb(255, 255, 255)',
  )
  await expect(menu.locator('.select-separator')).toHaveCount(3)
  const accessibility = await new AxeBuilder({ page })
    .include('.select-content')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: 'Karim Mansour', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(patientSelect).toContainText('Karim Mansour')
  await patientSelect.click()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await page.getByRole('button', { name: /Open settings/ }).isVisible())
    await page.getByRole('button', { name: /Open settings/ }).click()
  else await page.locator('.doctor-account').click()
  await chooseOption(page, 'Clinic time zone', 'UTC')
  await expect(page.getByRole('combobox', { name: 'Clinic time zone', exact: true })).toContainText(
    'UTC',
  )
  await chooseOption(page, 'Calendar to display', 'Test calendar')
  await noOverflow(page)
})
