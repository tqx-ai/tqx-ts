import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(fileURLToPath(import.meta.url))

export const US_DAILY_MOVING_AVERAGE_FIXTURE_PATH = resolve(fixturesDir, 'fixtures/us_ma.py')

export const US_DAILY_MOVING_AVERAGE_FIXTURE = readFileSync(
  US_DAILY_MOVING_AVERAGE_FIXTURE_PATH,
  'utf8',
)
