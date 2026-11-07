import { test, expect } from '@playwright/test'

const baseURL = process.env.QUIZ_TEST_URL ?? 'http://127.0.0.1:4173'
test.use({
  baseURL,
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
})

test('mobile home, accessible form, private invite and authenticated answer reveal', async ({ page, browser }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page).toHaveTitle('Quiz Duel')
  await expect(page.getByRole('heading', { name: 'Duel a friend.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create game' })).toBeDisabled()
  await page.getByLabel('Your name').fill('Alice')
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByRole('button', { name: 'Play now' })).toBeVisible()
  const link = await page.getByRole('textbox', { name: 'Challenge link', exact: true }).inputValue()
  expect(new URL(link).pathname).toMatch(/^\/g\/[a-f0-9]{32}$/)
  const identity = await page.evaluate(() => JSON.parse(sessionStorage.getItem('quiz-duel')!))
  expect(identity.token).toMatch(/^[a-f0-9]{64}$/)
  expect(link).not.toContain(identity.token)

  const guestContext = await browser.newContext({ baseURL, viewport: { width: 375, height: 667 } })
  try {
    const guest = await guestContext.newPage()
    await guest.goto(link)
    await expect(guest.getByText('Alice dares you to a quiz duel.')).toBeVisible()
    await guest.getByLabel('Your name').fill('Bob')
    await guest.getByRole('button', { name: 'Join the duel' }).click()
    await expect(guest.getByText('Question 1 of 20')).toBeVisible()
    const guestIdentity = await guest.evaluate(() => JSON.parse(sessionStorage.getItem('quiz-duel')!))
    expect(guestIdentity.token).not.toBe(identity.token)

    const stateResponse = page.waitForResponse(res => res.url().endsWith(`/api/game/${identity.id}`))
    await page.getByRole('button', { name: 'Play now' }).click()
    const state = await (await stateResponse).json()
    expect(state.p1.questions).toHaveLength(20)
    for (const question of state.p1.questions) expect(question).not.toHaveProperty('correct')
    expect(state.p1).not.toHaveProperty('tokenHash')
    await expect(page.getByText('Question 1 of 20')).toBeVisible()

    // Hold the response to prove that the client cannot reveal an unsaved answer.
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/game/*/answer', async route => {
      const response = await route.fetch()
      await pending
      await route.fulfill({ response })
    })
    await page.getByRole('group', { name: 'Answers' }).getByRole('button').first().click()
    await expect(page.getByText('Correct.', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/was right\.$/)).toHaveCount(0)
    const answerResponse = page.waitForResponse(res => res.url().endsWith('/answer'))
    release()
    const answer = await (await answerResponse).json()
    expect(answer.correct).toBeGreaterThanOrEqual(0)
    await expect(page.getByText(/^(Correct\.|Not this time)/)).toBeVisible()
    await expect(page.getByText('Question 2 of 20')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Question 2 of 20')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await guestContext.close()
  }
})

test('expired or invalid credentials recover to a new game', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('quiz-duel', JSON.stringify({
    id: 'a'.repeat(32), slot: 1, name: 'Missing', token: 'b'.repeat(64),
  })))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Game not found.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start a new duel' }).click()
  await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('quiz-duel'))).toBeNull()
})

test('legacy identity and invalid links cannot resume an unauthenticated player', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.setItem('quiz-duel', JSON.stringify({ id: 'abc123', slot: 1, name: 'Old' })))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible()
  await page.goto('/g/abc123')
  await expect(page.getByRole('heading', { name: 'Game not found.' })).toBeVisible()
})

test('production pages and API responses have security headers', async ({ request }) => {
  const page = await request.get('/')
  expect(page.status()).toBe(200)
  expect(page.headers()['content-security-policy']).toContain("script-src 'self'")
  expect(page.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(page.headers()['referrer-policy']).toBe('no-referrer')
  expect(page.headers()['x-content-type-options']).toBe('nosniff')
  expect(page.headers()['x-frame-options']).toBe('DENY')
  const api = await request.get('/api/config')
  expect(api.headers()['cache-control']).toBe('no-store')
  expect(api.headers()['x-frame-options']).toBe('DENY')
})

test('desktop keyboard controls and reduced motion still work', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Your name')).toBeFocused()
  await page.keyboard.type('Keyboard player')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Create game' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('creation abuse returns HTTP 429 and a retry time', async ({ request }) => {
  let limited = false
  for (let i = 0; i < 12; i++) {
    const response = await request.post('/api/game', { data: { name: 123 } })
    if (response.status() === 429) {
      expect(response.headers()['retry-after']).toBe('60')
      limited = true
      break
    }
    expect(response.status()).toBe(400)
  }
  expect(limited).toBe(true)
})
