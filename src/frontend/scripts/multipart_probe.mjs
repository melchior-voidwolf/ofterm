import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
page.on('console', (m) => console.log('console', m.type(), m.text()))
await page.goto('http://127.0.0.1:5122/?nogl=1&debug=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) {
  await pw.fill('demo-password-123')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(1200)
await page.locator('.xterm-screen').click()
await page.keyboard.type('/Users/kail/fntermx/contrib/imgcat /tmp/ofterm-icon-test.png')
await page.keyboard.press('Enter')
await page.waitForTimeout(1500)

const before = await page.evaluate(() => {
  const c = window.__ofterm
  return {
    multipart: c.multipart,
    layers: document.querySelectorAll('.xterm-image-layer').length,
    buffer: Array.from({ length: 12 }, (_, i) => c.terminal.buffer.active.getLine(i)?.translateToString(true)),
  }
})
console.log('before', JSON.stringify(before, null, 2))

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lY1X6QAAAABJRU5ErkJggg=='
await page.evaluate((b64) => {
  const c = window.__ofterm
  c.terminal.write(`\x1b]1337;File=inline=1;size=68:${b64}\x07`)
}, png)
await page.waitForTimeout(1000)
const after = await page.evaluate(() => ({
  layers: document.querySelectorAll('.xterm-image-layer').length,
  canvases: Array.from(document.querySelectorAll('canvas')).map((c) => c.className),
}))
console.log('after', JSON.stringify(after, null, 2))
await page.screenshot({ path: '/tmp/ofterm-multipart.png' })
await browser.close()
