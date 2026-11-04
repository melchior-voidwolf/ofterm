import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
page.on('console', (m) => console.log('console', m.type(), m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
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
await page.waitForTimeout(2000)
const info = await page.evaluate(() => {
  const screen = document.querySelector('.xterm-screen')
  const imgs = Array.from(document.querySelectorAll('img')).map((i) => ({
    src: i.src.slice(0, 40),
    w: i.width,
    h: i.height,
    cls: i.className,
    style: i.getAttribute('style'),
  }))
  const layers = Array.from(document.querySelectorAll('.xterm-screen > *')).map((e) => ({
    tag: e.tagName,
    cls: e.className,
    style: e.getAttribute('style'),
  }))
  const c = window.__ofterm
  const b = c?.terminal.buffer.active
  const lines = []
  if (b) for (let i = 0; i < Math.min(b.length, 30); i++) lines.push(b.getLine(i).translateToString(true))
  return { imgs, layers, lines, addons: c ? Object.keys(c) : null }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/ofterm-imgcat.png' })
await browser.close()
