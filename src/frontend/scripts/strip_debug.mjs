import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) { await pw.fill('demo-password-123'); await page.keyboard.press('Enter') }
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const pts = [[100, 780], [100, 790], [100, 792], [100, 800], [640, 790]]
  const at = (x, y) => {
    const e = document.elementFromPoint(x, y)
    if (!e) return null
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    return { tag: e.tagName, cls: e.className, bg: cs.backgroundColor, rect: { y: r.y, h: r.height } }
  }
  return {
    inner: { w: innerWidth, h: innerHeight },
    pts: pts.map(([x, y]) => ({ x, y, at: at(x, y) })),
    workspace: (() => { const e = document.querySelector('.workspace'); const r = e.getBoundingClientRect(); return { y: r.y, h: r.height, bg: getComputedStyle(e).backgroundColor } })(),
    status: (() => { const e = document.querySelector('.statusbar'); const r = e.getBoundingClientRect(); return { y: r.y, h: r.height, bg: getComputedStyle(e).backgroundColor } })(),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
