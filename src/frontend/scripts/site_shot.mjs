import { chromium } from '@playwright/test'

// Screenshot the static landing page in both languages for visual review.
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
await page.goto('file:///Users/kail/fntermx/site/index.html')
await page.waitForTimeout(400)
await page.screenshot({ path: '/tmp/site-zh-top.png' })
await page.evaluate(() => document.getElementById('features').scrollIntoView())
await page.waitForTimeout(300)
await page.screenshot({ path: '/tmp/site-zh-features.png' })
await page.evaluate(() => document.getElementById('download').scrollIntoView())
await page.waitForTimeout(300)
await page.click('#langToggle')
await page.waitForTimeout(300)
await page.evaluate(() => window.scrollTo(0, 0))
await page.screenshot({ path: '/tmp/site-en-top.png' })
await browser.close()
console.log('done')
