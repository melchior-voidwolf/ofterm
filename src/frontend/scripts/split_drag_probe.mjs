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
await page.keyboard.type('printf "PANE_ONE\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

// Floating control: split right.
await page.getByRole('button', { name: '向右分屏' }).click()
await page.waitForTimeout(800)
const afterFirst = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  rows: Array.from(document.querySelectorAll('.terminal-pane.is-visible .xterm-rows')).map((e) => e.textContent?.slice(0, 120)),
  dividers: document.querySelectorAll('.pane-divider').length,
}))
console.log('after first split', JSON.stringify(afterFirst))

// Keyboard: split down.
await page.locator('.xterm-screen').last().click()
await page.keyboard.press('Meta+Alt+Backslash')
await page.waitForTimeout(800)
const afterSecond = await page.evaluate(() => ({
  panes: document.querySelectorAll('.terminal-pane.is-visible').length,
  dividers: document.querySelectorAll('.pane-divider').length,
}))
console.log('after keyboard split', JSON.stringify(afterSecond))

// Drag the row divider.
const divider = page.locator('.pane-divider.row').first()
const box = await divider.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(600)
}
const afterDrag = await page.evaluate(() => ({
  slots: Array.from(document.querySelectorAll('.pane-slot')).map((e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), w: Math.round(r.width) }
  }),
}))
console.log('after drag', JSON.stringify(afterDrag))
await page.screenshot({ path: '/tmp/ofterm-split-drag.png' })
await browser.close()
