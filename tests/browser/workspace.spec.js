import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockWorkspace } from '../fixtures/mock-workspace.js'

test.beforeEach(async ({ page }) => {
  await mockWorkspace(page)
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
  await expect(page.locator('.appointment').filter({ hasText: 'Lina Tabet' })).toContainText(
    'Linked',
  )
  await expect(page.locator('.appointment').filter({ hasText: 'Lina Tabet' })).toContainText(
    'Initial assessment',
  )
  await page.locator('.appointment').filter({ hasText: 'Lina Tabet' }).click()
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
  if (await page.getByRole('button', { name: 'Open settings', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  else await page.locator('.doctor-account').click()
  await chooseOption(page, 'Clinic time zone', 'UTC')
  await expect(page.getByRole('combobox', { name: 'Clinic time zone', exact: true })).toContainText(
    'UTC',
  )
  await chooseOption(page, 'Calendar to display', 'Test calendar')
  await noOverflow(page)
})
