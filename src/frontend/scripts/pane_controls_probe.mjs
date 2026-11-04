import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('console', m.type(), m.text())
})
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) {
  await pw.fill('demo-password-123')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(1000)
await page.locator('.xterm-screen').first().click()
await page.keyboard.type('printf "ONE\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)

await page.locator('.terminal-pane.is-visible .split-control').first().getByRole('button', { name: '向右分屏' }).click()
await page.waitForTimeout(700)
await page.locator('.terminal-pane.is-visible .split-control').nth(1).getByRole('button', { name: '向下分屏' }).click()
await page.waitForTimeout(700)

const state1 = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  controls: document.querySelectorAll('.split-control').length,
  closeButtons: document.querySelectorAll('.split-control .split-close').length,
  rows: Array.from(document.querySelectorAll('.terminal-pane.is-visible .xterm-rows')).map((e) => e.textContent?.slice(0, 60)),
}))
console.log('after splits', JSON.stringify(state1))

const divider = page.locator('.pane-divider.row').first()
const box = await divider.boundingBox()
if (box) {
  await page.mouse.move(box.x + 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}
const state2 = await page.evaluate(() => ({
  slots: Array.from(document.querySelectorAll('.pane-slot')).map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) } }),
}))
console.log('after drag', JSON.stringify(state2))

// Close the second pane via its floating control.
await page.locator('.split-control .split-close').nth(1).click()
await page.waitForTimeout(600)
const state3 = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  controls: document.querySelectorAll('.split-control').length,
  closeButtons: document.querySelectorAll('.split-control .split-close').length,
}))
console.log('after close pane', JSON.stringify(state3))
await page.screenshot({ path: '/tmp/ofterm-pane-controls.png' })
await browser.close()
