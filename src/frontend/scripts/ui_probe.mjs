import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text())
})
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message))

await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

const password = page.locator('input[type=password]').first()
if (await password.count()) {
  await password.fill('demo-password-123')
  const submit = page.locator('button[type=submit]').first()
  if (await submit.count()) await submit.click()
  else await page.keyboard.press('Enter')
}

await page.waitForTimeout(1200)
const term = page.locator('.xterm-screen').first()
if (await term.count()) {
  await term.click()
  await page.keyboard.type('printf "OFTERM_UI_OK\\n"')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await page.keyboard.type('/Users/kail/fntermx/contrib/imgcat /tmp/ofterm-icon-test.png')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
}

await page.screenshot({ path: '/tmp/ofterm-ui.png', fullPage: false })
console.log('title:', await page.title())
console.log('url:', page.url())
console.log('errors:', errors)
console.log('body text:', (await page.locator('body').innerText()).slice(0, 800))
await browser.close()
