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
await page.getByRole('button', { name: '设置' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/ofterm-settings.png' })
await page.getByRole('tab', { name: 'Colors' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/ofterm-colors.png' })
await browser.close()
