import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// The CLI/SDK Skill owns domain references. The MCP Skill has its own entrypoint and
// action reference but bundles identical domain resources inside the plugin boundary.
const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'skills/tqx-research/references')
const target = resolve(root, 'plugins/agent-plugin/skills/tqx-research/references')
const shared = [
  'workflow.md',
  'factor-creation.md',
  'factor-operators.md',
  'strategy_templates.md',
  'strategy-quality.md',
  'backtest-parameters.md',
  'factor-driven.md',
  'stock_hk_api.md',
  'stock_us_api.md',
  'time_series_strategies.md',
  'cross_sectional_strategies.md',
  'tqx_data_usage.md',
  'tqx_data_quick_reference.md',
  'tqx_data_market_matrix.md',
  'data',
  'strategy-examples.md',
]
function files(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name)
    if (entry.isDirectory()) return files(child)
    if (!entry.isFile()) throw new Error(`Research resources must be regular files: ${child}`)
    return [child]
  })
}
const expected = new Map<string, Buffer>()
for (const entry of shared) {
  const path = join(source, entry)
  const entries = entry.endsWith('.md') ? [path] : files(path)
  for (const file of entries) expected.set(relative(source, file), readFileSync(file))
}
const actual = files(target).filter((path) => relative(target, path) !== 'mcp.md')
const stale = [...expected].filter(([name, bytes]) => {
  const path = join(target, name)
  return !existsSync(path) || !readFileSync(path).equals(bytes)
})
const extra = actual.filter((path) => !expected.has(relative(target, path)))
if (process.argv.includes('--check')) {
  if (stale.length || extra.length) {
    console.error('Research plugin resources are stale. Run bun scripts/sync-research-docs.ts.')
    process.exit(1)
  }
} else {
  for (const path of extra) rmSync(path)
  for (const [name] of stale) {
    mkdirSync(dirname(join(target, name)), { recursive: true })
    cpSync(join(source, name), join(target, name))
  }
}
