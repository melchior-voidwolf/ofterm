import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto('http://127.0.0.1:5122/?nogl=1&debug=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: '设置' }).click()
await page.getByRole('tab', { name: 'Help' }).click()
await page.getByRole('button', { name: '在当前终端安装辅助工具' }).click()
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const c = window.__ofterm
  const b = c?.terminal.buffer.active
  const lines = []
  if (b) for (let i = 0; i < Math.min(b.length, 30); i++) lines.push(b.getLine(i).translateToString(true))
  return { dialog: !!document.querySelector('.settings-dialog'), lines }
})
console.log(JSON.stringify(info, null, 2))
await page.screenshot({ path: '/tmp/ofterm-install-utils.png' })
await browser.close()
