import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console', m.type(), m.text())
})
await page.goto('http://127.0.0.1:5122/?nogl=1&debug=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) {
  await pw.fill('demo-password-123')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(1200)
await page.locator('.xterm-screen').first().click()
await page.keyboard.type('printf "PANE_ONE\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
await page.keyboard.press('Meta+d')
await page.waitForTimeout(900)
await page.locator('.xterm-screen').nth(1).click()
await page.keyboard.type('printf "PANE_TWO\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/ofterm-split-row.png' })
const rowState = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  dividers: document.querySelectorAll('.pane-divider').length,
  splits: Array.from(document.querySelectorAll('.pane-split')).map((e) => e.className),
}))
console.log('row', JSON.stringify(rowState))
await page.keyboard.press('Meta+Shift+d')
await page.waitForTimeout(900)
await page.locator('.xterm-screen').last().click()
await page.keyboard.type('printf "PANE_THREE\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/ofterm-split-both.png' })
const bothState = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  dividers: document.querySelectorAll('.pane-divider').length,
  splits: Array.from(document.querySelectorAll('.pane-split')).map((e) => e.className),
  sshText: document.body.innerText.includes('SSH'),
}))
console.log('both', JSON.stringify(bothState))
await browser.close()
