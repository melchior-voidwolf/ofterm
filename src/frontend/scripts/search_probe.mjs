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
await page.locator('.xterm-screen').click()
await page.keyboard.type('printf "needle one needle two needle three\\n"')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
await page.keyboard.press('Meta+f')
await page.waitForTimeout(200)
await page.keyboard.type('needle')
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/ofterm-search.png' })
await browser.close()
