import { chromium } from '@playwright/test'

const base = 'http://10.0.0.40:5122/?nogl=1'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message))

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

const read = async () => ({
  tab: (await page.locator('.tab-title').first().textContent())?.trim(),
  newTabTitle: await page.locator('.new-tab-button').getAttribute('title'),
  status: (await page.locator('.status-text').first().textContent())?.trim(),
  settingsTitle: await page.locator('.toolbar-button[title]').last().getAttribute('title'),
})
console.log('initial:', JSON.stringify(await read()))

// Run a foreground program: tab title should switch to it (iTerm2 behavior).
await page.locator('.xterm-screen').first().click()
await page.keyboard.type('sleep 30')
await page.keyboard.press('Enter')
await page.waitForTimeout(2500)
console.log('running sleep:', JSON.stringify(await read()))

await page.keyboard.press('Control+c')
await page.waitForTimeout(2500)
console.log('after ctrl-c:', JSON.stringify(await read()))

// Settings dialog should render in English (headless Chrome = en-US).
await page.keyboard.press('Escape').catch(() => undefined)
await page.locator('.toolbar-button[title]').last().click()
await page.waitForTimeout(600)
const tabs = await page.locator('.settings-sidebar [role="tab"]').allTextContents()
const langRow = await page.locator('.settings-row-label').allTextContents()
console.log('settings tabs:', JSON.stringify(tabs))
console.log('appearance rows:', JSON.stringify(langRow))

// Switch language to Chinese explicitly, verify chrome flips.
await page.locator('.settings-row-control select').nth(1).selectOption('zh-CN')
await page.waitForTimeout(400)
console.log('after zh-CN switch, new-tab title:', await page.locator('.new-tab-button').getAttribute('title'))
const tabsZh = await page.locator('.settings-sidebar [role="tab"]').allTextContents()
console.log('settings tabs zh:', JSON.stringify(tabsZh))

console.log('pageerrors:', errors.length ? errors : 'none')
await browser.close()
