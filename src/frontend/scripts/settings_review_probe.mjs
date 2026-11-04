import { chromium } from '@playwright/test'

const base = 'http://10.0.0.40:5122/?nogl=1'
const shot = (page, name) => page.screenshot({ path: `/tmp/ofterm-review-${name}.png` })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// --- save/cancel semantics ---
const getFontSize = async () => {
  const res = await page.evaluate(async () => (await fetch('api/v1/settings', { credentials: 'same-origin' })).json())
  return res.fontSize
}
const before = await getFontSize()

await page.locator('.toolbar-button[title]').last().click()
await page.waitForTimeout(400)
await page.locator('.settings-sidebar [role="tab"]').nth(1).click() // Text
await page.locator('.settings-row-control input[type=number]').first().fill(String(before + 2))
await page.locator('.settings-footer button').first().click() // Cancel
await page.waitForTimeout(700)
const afterCancel = await getFontSize()
console.log('cancel: before =', before, 'afterCancel =', afterCancel, afterCancel === before ? 'OK' : 'FAIL')

await page.locator('.toolbar-button[title]').last().click()
await page.waitForTimeout(400)
await page.locator('.settings-sidebar [role="tab"]').nth(1).click()
const input = page.locator('.settings-row-control input[type=number]').first()
console.log('draft resets on reopen:', (await input.inputValue()) === String(before) ? 'OK' : 'FAIL', await input.inputValue())
await input.fill(String(before))
await page.locator('.settings-footer button').last().click() // Save
await page.waitForTimeout(700)
const afterSave = await getFontSize()
console.log('save: afterSave =', afterSave, afterSave === before ? 'OK' : 'FAIL')

// --- visual review: every settings tab ---
for (const [i, name] of ['appearance', 'text', 'colors', 'help', 'about'].entries()) {
  await page.locator('.toolbar-button[title]').last().click()
  await page.waitForTimeout(400)
  await page.locator('.settings-sidebar [role="tab"]').nth(i).click()
  await page.waitForTimeout(400)
  await shot(page, `settings-${name}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// --- workspace: split panes + search bar + toast ---
await page.keyboard.press('Control+\\')
await page.waitForTimeout(1500)
await page.keyboard.press('Control+Alt+\\')
await page.waitForTimeout(1500)
await shot(page, 'workspace-split')

await page.keyboard.press('Control+Shift+f')
await page.waitForTimeout(400)
await shot(page, 'search-bar')
await page.keyboard.press('Escape')

// --- zh-CN settings appearance ---
await page.evaluate(async () => {
  const res = await fetch('api/v1/settings', { credentials: 'same-origin' })
  const s = await res.json()
  s.language = 'zh-CN'
  await fetch('api/v1/settings', {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OFTerm' },
    body: JSON.stringify(s),
  })
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.locator('.toolbar-button[title]').last().click()
await page.waitForTimeout(400)
await shot(page, 'settings-zh-appearance')
await page.locator('.settings-sidebar [role="tab"]').nth(1).click()
await page.waitForTimeout(300)
await shot(page, 'settings-zh-text')

await browser.close()
console.log('screenshots in /tmp/ofterm-review-*.png')
