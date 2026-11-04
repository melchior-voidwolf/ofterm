import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, '../../backend/internal/web/dist')
mkdirSync(dist, { recursive: true })
writeFileSync(resolve(dist, '.keep'), '')
