import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) { await pw.fill('demo-password-123'); await page.keyboard.press('Enter') }
await page.waitForTimeout(900)
await page.locator('.xterm-screen').first().click()
await page.getByRole('button', { name: '向右分屏' }).click()
await page.waitForTimeout(600)
await page.locator('.xterm-screen').last().click()
await page.keyboard.press('Meta+Alt+Backslash')
await page.waitForTimeout(600)
const before = await page.evaluate(() => ({
  dividers: Array.from(document.querySelectorAll('.pane-divider')).map((e) => {
    const r = e.getBoundingClientRect(); return { cls: e.className, x: r.x, y: r.y, w: r.width, h: r.height }
  }),
  slots: Array.from(document.querySelectorAll('.pane-slot')).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, y: r.y, h: r.height } }),
}))
console.log('before', JSON.stringify(before))
const d = page.locator('.pane-divider.row').first()
const box = await d.boundingBox()
console.log('box', box)
console.log('hit', await page.evaluate(() => { const e = document.elementFromPoint(640, 400); return e ? e.className + '|' + e.tagName : null }))
const logs = []
page.on('console', (m) => logs.push(m.text()))
if (box) {
  await page.mouse.move(box.x + 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x + 160, box.y + 200, { steps: 10 })
  await page.mouse.up()
}
await page.waitForTimeout(800)
console.log('logs', logs)
const after = await page.evaluate(() => ({
  slots: Array.from(document.querySelectorAll('.pane-slot')).map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) } }),
  dividers: Array.from(document.querySelectorAll('.pane-divider')).map((e) => { const r = e.getBoundingClientRect(); return { cls: e.className, x: Math.round(r.x), y: Math.round(r.y) } }),
}))
console.log('after', JSON.stringify(after))
await page.screenshot({ path: '/tmp/ofterm-drag-final.png' })
await browser.close()
