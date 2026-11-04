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
await page.waitForTimeout(1000)
await page.locator('.xterm-screen').click()
await page.keyboard.type('imgcat /tmp/ofterm-icon-test.png')
await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
await page.keyboard.type('printf "AFTER_IMAGE\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const c = window.__ofterm
  const b = c.terminal.buffer.active
  const lines = []
  for (let i = 0; i < Math.min(b.length, 40); i++) lines.push(b.getLine(i).translateToString(true))
  return { layers: document.querySelectorAll('.xterm-image-layer').length, lines }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/ofterm-imgcat-order.png' })
await browser.close()
