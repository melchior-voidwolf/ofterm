import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto('http://127.0.0.1:5122/?nogl=1&debug=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.getByRole('button', { name: '设置' }).click()
await page.getByRole('tab', { name: 'Help' }).click()
await page.getByRole('button', { name: '在当前终端安装辅助工具' }).click()
await page.waitForTimeout(5000)
await page.locator('.xterm-screen').click()
await page.keyboard.type('command -v imgcat; command -v ofn-check')
await page.keyboard.press('Enter')
await page.waitForTimeout(700)
const lines = await page.evaluate(() => {
  const b = window.__ofterm.terminal.buffer.active
  return Array.from({ length: Math.min(12, b.length) }, (_, i) => b.getLine(i)?.translateToString(true))
})
console.log(lines.join('\n'))
await browser.close()
