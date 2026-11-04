import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const source = process.argv[2] ?? '/Users/kail/Downloads/ofterm-svg-masters/ofterm-01-blue-white.svg'
const svg = readFileSync(source, 'utf8')
const outDir = process.argv[3] ?? '/tmp/ofterm-icons'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
for (const size of [1024, 256, 64]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`)
  await page.screenshot({
    path: resolve(outDir, `icon-${size}.png`),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
}
await browser.close()
writeFileSync(resolve(outDir, 'source.svg'), svg)
console.log('rendered', outDir)
