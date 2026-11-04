import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
page.on('console', (m) => console.log('console', m.type(), m.text()))
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://127.0.0.1:5122/?debug=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) {
  await pw.fill('demo-password-123')
  await page.keyboard.press('Enter')
}
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const host = document.querySelector('.terminal-host')
  const screen = document.querySelector('.xterm-screen')
  return {
    hostHTML: host?.innerHTML.slice(0, 1200),
    rows: document.querySelector('.xterm-rows')?.textContent?.slice(0, 300),
    canvases: Array.from(document.querySelectorAll('canvas')).map((c) => ({
      w: c.width,
      h: c.height,
      cls: c.className,
      rect: c.getBoundingClientRect().toJSON(),
    })),
    screenRect: screen?.getBoundingClientRect().toJSON(),
    textarea: (document.querySelector('.xterm-helper-textarea'))?.value,
    buffer: (() => { const c = window.__ofterm; if (!c) return null; const b = c.terminal.buffer.active; const out = []; for (let i = 0; i < Math.min(b.length, 40); i++) out.push(b.getLine(i).translateToString(true)); return out; })(),
    fonts: {
      menlo: document.fonts.check('13px Menlo'),
      jb: document.fonts.check('13px "JetBrains Mono"'),
    },
  }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/ofterm-ui2.png' })
await browser.close()
