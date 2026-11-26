import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'vite'
import { backtestViteConfig } from './backtest-vite'

export const output = new URL('../dist/apps/qube/backtest/report-v1.html', import.meta.url)

export async function buildBacktestApp(): Promise<string> {
  // Vite defaults NODE_ENV globally. Preserve the co-located development server's mode.
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  let result: Awaited<ReturnType<typeof build>>
  try {
    result = await build(backtestViteConfig())
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
  if (!('output' in result)) throw new Error('Expected one static App build')
  const assets = result.output
  const page = assets.find((asset) => asset.type === 'asset' && asset.fileName === 'index.html')
  if (!page || page.type !== 'asset' || typeof page.source !== 'string' || assets.length !== 1)
    throw new Error('Backtest App must produce exactly one HTML file')
  const html = page.source
  if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["']stylesheet["']/i.test(html))
    throw new Error('Backtest App contains external scripts or styles')
  if (Buffer.byteLength(html) > 1_048_576) throw new Error('Backtest App HTML exceeds 1 MiB')
  await mkdir(new URL('.', output), { recursive: true })
  await writeFile(output, html)
  return html
}

if (import.meta.main) {
  const html = await buildBacktestApp()
  console.log(`Backtest App: ${Buffer.byteLength(html)} bytes`)
}
