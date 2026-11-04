import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://10.0.0.88:5122/?nogl=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(1400)
const info = await page.evaluate(() => ({
  secure: window.isSecureContext,
  hasRandomUUID: typeof crypto.randomUUID === 'function',
  terminals: document.querySelectorAll('.xterm-screen').length,
  tabs: document.querySelectorAll('.tab').length,
  body: document.body.innerText.slice(0, 120),
}))
console.log(JSON.stringify(info, null, 2), 'errors:', errors)
await browser.close()
