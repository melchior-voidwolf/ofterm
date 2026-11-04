import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) {
  await pw.fill('demo-password-123')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(1000)
await page.locator('.xterm-screen').first().click()
await page.keyboard.press('Meta+d')
await page.waitForTimeout(700)
await page.keyboard.press('Meta+Shift+d')
await page.waitForTimeout(900)
const info = await page.evaluate(() => {
  const rect = (e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  return {
    panes: Array.from(document.querySelectorAll('.terminal-pane.is-visible')).map((p) => ({
      pane: rect(p),
      host: rect(p.querySelector('.terminal-host')),
      xterm: p.querySelector('.xterm') ? rect(p.querySelector('.xterm')) : null,
      screen: p.querySelector('.xterm-screen') ? rect(p.querySelector('.xterm-screen')) : null,
      canvas: Array.from(p.querySelectorAll('canvas')).map((c) => ({ cls: c.className, ...rect(c) })),
      bg: getComputedStyle(p).backgroundColor,
      xtermBg: p.querySelector('.xterm-scrollable-element')
        ? getComputedStyle(p.querySelector('.xterm-scrollable-element')).backgroundColor
        : null,
    })),
    splits: Array.from(document.querySelectorAll('.pane-split')).map((s) => ({ cls: s.className, ...rect(s) })),
  }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/ofterm-split-debug.png' })
await browser.close()
