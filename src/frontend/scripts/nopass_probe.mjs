import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://127.0.0.1:5122/?nogl=1&debug=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const info = await page.evaluate(() => ({
  passwordInputs: document.querySelectorAll('input[type=password]').length,
  terminals: document.querySelectorAll('.xterm-screen').length,
  tabs: document.querySelectorAll('.tab').length,
  status: document.querySelector('.status-text')?.textContent,
}))
console.log(JSON.stringify(info), errors)
await page.screenshot({ path: '/tmp/ofterm-nopass.png' })
await browser.close()
