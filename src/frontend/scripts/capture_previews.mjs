import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Capture marketing previews against the Linux dev backend (job titles need
// Linux /proc). Rounded corners come from a transparent page background plus
// a clipped .app-shell; screenshots use omitBackground.
const BASE = 'http://10.0.0.40:5122/?nogl=1'
const out = '/tmp/ofterm-previews-raw'
mkdirSync(out, { recursive: true })

// Force a known starting state (zh-CN + defaults) via the API; the UI locale
// at capture time must not depend on whatever a previous session stored.
const forceSettings = async (patch) => {
  await page.evaluate(async (p) => {
    const res = await fetch('api/v1/settings', { credentials: 'same-origin' })
    const s = await res.json()
    await fetch('api/v1/settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'OFTerm' },
      body: JSON.stringify({ ...s, ...p }),
    })
  }, patch)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
await forceSettings({ language: 'zh-CN', uiTheme: 'system', themeId: 'material-design-colors' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

const ROUNDED = 'html,body{background:transparent!important} .app-shell{border-radius:20px;overflow:hidden}'
const shot = async (name) => {
  await page.addStyleTag({ content: ROUNDED })
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: true })
  await page.addStyleTag({ content: 'html,body{background:initial} .app-shell{border-radius:0}' })
}

const openSettings = async () => {
  await page.getByRole('button', { name: '设置' }).click()
  await page.waitForTimeout(400)
}
const saveSettings = async () => {
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForTimeout(600)
}

// Force zh-CN and product defaults for the captures.
await openSettings()
await page.locator('.settings-row-control select').nth(0).selectOption('system')
await page.getByRole('tab', { name: '配色' }).click()
await page.locator('.theme-card').filter({ hasText: 'Material Design Colors' }).click()
await saveSettings()

const screens = page.locator('.terminal-pane.is-visible .xterm-screen')
const run = async (paneIndex, text, wait = 700) => {
  await screens.nth(paneIndex).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(wait)
}

// 01 — split workspace with a live job title in the tab.
await run(0, 'clear; git --no-pager log --oneline -8 2>/dev/null || ls -la; printf "\\n"; go version 2>/dev/null; node --version 2>/dev/null', 1400)
await page.locator('.terminal-pane.is-visible .split-control').first().getByRole('button', { name: '向右分屏' }).click()
await page.waitForTimeout(1200)
await run(1, 'clear; imgcat /tmp/ofterm-icons/icon-256.png', 1600)
await screens.first().click()
await page.keyboard.type('vim')
await page.keyboard.press('Enter')
await page.waitForTimeout(2500) // let the job watcher push the vim title
// Keep both panes vivid for the marketing capture; dimming is a runtime behavior.
await page.addStyleTag({ content: '.terminal-pane:not(.is-focused) .terminal-host{opacity:1 !important}' })
await shot('01-workspace')

// 02 — color presets.
await openSettings()
await page.getByRole('tab', { name: '配色' }).click()
await page.waitForTimeout(500)
await shot('02-colors')

// 03 — help page.
await page.getByRole('tab', { name: '帮助' }).click()
await page.waitForTimeout(500)
await shot('03-help')

// 05 — inline images: full-width imgls grid + imgcat.
await page.getByRole('button', { name: '取消', exact: true }).click()
await page.waitForTimeout(400)
await screens.first().click()
await page.keyboard.press('Escape')
await page.keyboard.type(':q!')
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
// Close the right pane so imgls has the full width.
await page.getByRole('button', { name: /关闭 pane/ }).nth(1).click()
await page.waitForTimeout(1000)
await run(0, 'cd /tmp/ofterm-imgdemo; clear', 600)
await run(0, '/tmp/ofterm-utils/imgls', 2600)
await shot('05-imgls')

// 04 — light theme workspace.
await openSettings()
await page.getByRole('tab', { name: '外观' }).click()
await page.locator('.settings-row-control select').nth(0).selectOption('light')
await page.getByRole('tab', { name: '配色' }).click()
await page.locator('.theme-card').filter({ hasText: 'Light Background' }).click()
await saveSettings()
await run(0, 'clear; printf "OFTerm  ·  fnOS\\n\\n"; uname -a', 1000)
await shot('04-light')

// Restore defaults for anyone previewing afterwards.
await forceSettings({ language: 'zh-CN', uiTheme: 'system', themeId: 'material-design-colors' })

await browser.close()
console.log('captured to', out)
