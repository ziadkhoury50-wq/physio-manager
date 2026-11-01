import { test, expect } from '@playwright/test'

test('missing credentials show setup instructions without exposing a demo workspace', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Set up your practice', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.locator('.patient-card,.session-card,.appointment')).toHaveCount(0)
  await expect(page.getByText('Design preview', { exact: true })).toHaveCount(0)
})
