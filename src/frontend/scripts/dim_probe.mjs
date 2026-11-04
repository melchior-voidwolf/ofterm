import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
const pw = page.locator('input[type=password]').first()
if (await pw.count()) { await pw.fill('demo-password-123'); await page.keyboard.press('Enter') }
await page.waitForTimeout(900)
await page.locator('.xterm-screen').first().click()
await page.getByRole('button', { name: '向右分屏' }).first().click()
await page.waitForTimeout(700)
console.log(await page.evaluate(() => Array.from(document.querySelectorAll('.terminal-pane.is-visible')).map((p) => ({
  cls: p.className,
  hostOpacity: p.querySelector('.terminal-host') ? getComputedStyle(p.querySelector('.terminal-host')).opacity : null,
}))))
await browser.close()
