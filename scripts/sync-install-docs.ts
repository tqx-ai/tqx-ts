import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// INSTALL.md is the canonical agent install protocol. Skills are installed one directory at a
// time, so each Skill that runs the CLI ships its own byte-identical copy.
const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'INSTALL.md')
const copies = [
  'skills/tqx-trading/references/install.md',
  'skills/tqx-research/references/install.md',
].map((path) => resolve(root, path))

const check = process.argv.includes('--check')
const expected = readFileSync(source, 'utf8')
const stale = copies.filter((path) => {
  try {
    return readFileSync(path, 'utf8') !== expected
  } catch {
    return true
  }
})

if (check) {
  if (stale.length > 0) {
    console.error(
      `Out of sync with INSTALL.md: ${stale.join(', ')}. Run bun scripts/sync-install-docs.ts.`,
    )
    process.exit(1)
  }
} else {
  for (const path of stale) writeFileSync(path, expected)
}
