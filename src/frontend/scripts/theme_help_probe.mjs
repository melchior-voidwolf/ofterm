import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: '设置' }).click()
await page.getByRole('tab', { name: 'Colors' }).click()
await page.locator('input[type=file]').setInputFiles('/Users/kail/fntermx/themes/Material-Design-Colors.itermcolors')
await page.waitForTimeout(900)
const afterImport = await page.evaluate(() => ({
  cards: document.querySelectorAll('.theme-card').length,
  active: document.querySelector('.theme-card.is-active')?.textContent,
  error: document.querySelector('.form-error')?.textContent,
}))
console.log('import', JSON.stringify(afterImport))
const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
await page.getByRole('button', { name: '导出当前配色' }).click()
const dl = await downloadPromise
console.log('download', dl ? dl.suggestedFilename() : null)
await page.getByRole('tab', { name: 'Help' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/ofterm-help.png' })
console.log('help headings', await page.locator('.help-section h4').allTextContents())
console.log('errors', errors)
await browser.close()
