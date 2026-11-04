import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const out = '/tmp/ofterm-previews-raw'
mkdirSync(out, { recursive: true })

await page.goto('http://127.0.0.1:5122/?nogl=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// Always start from the product defaults.
await page.getByRole('button', { name: '设置' }).click()
await page.waitForTimeout(300)
await page.getByRole('tab', { name: 'Appearance' }).click()
await page.locator('.settings-row-control select').first().selectOption('system')
await page.getByRole('tab', { name: 'Colors' }).click()
await page.locator('.theme-card').filter({ hasText: 'Material Design Colors' }).click()
await page.getByRole('button', { name: '关闭' }).click()
await page.waitForTimeout(700)

const run = async (paneIndex, text, wait = 700) => {
  const screens = page.locator('.terminal-pane.is-visible .xterm-screen')
  await screens.nth(paneIndex).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(wait)
}

await run(0, 'cd ~/ofterm; clear; git --no-pager log --oneline -8; printf "\\n"; go version; node --version', 1400)
await page.locator('.terminal-pane.is-visible .split-control').first().getByRole('button', { name: '向右分屏' }).click()
await page.waitForTimeout(900)
await run(1, 'clear; imgcat /tmp/ofterm-icons/icon-256.png', 1400)
await page.locator('.terminal-pane.is-visible .xterm-screen').first().click()
await page.waitForTimeout(400)
// Keep both panes vivid for the marketing capture; the dimming remains a runtime behavior.
await page.addStyleTag({ content: '.terminal-pane:not(.is-focused) .terminal-host{opacity:1 !important}' })
await page.screenshot({ path: `${out}/01-workspace.png` })

// Settings -> Colors
await page.getByRole('button', { name: '设置' }).click()
await page.waitForTimeout(400)
await page.getByRole('tab', { name: 'Colors' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/02-colors.png` })

// Settings -> Help
await page.getByRole('tab', { name: 'Help' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/03-help.png` })

// Light theme workspace
await page.getByRole('tab', { name: 'Appearance' }).click()
await page.locator('.settings-row-control select').first().selectOption('light')
await page.getByRole('tab', { name: 'Colors' }).click()
await page.locator('.theme-card').filter({ hasText: 'Light Background' }).click()
await page.getByRole('button', { name: '关闭' }).click()
await page.waitForTimeout(900)
await run(0, 'clear; printf "OFTerm  ·  fnOS\\n"; git status --short | head -5', 900)
await page.screenshot({ path: `${out}/04-light.png` })

await browser.close()
console.log('captured', out)
