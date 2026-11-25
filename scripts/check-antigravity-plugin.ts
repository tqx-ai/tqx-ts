import { resolve } from 'node:path'

import { checkAntigravityPlugin } from './lib/antigravity-plugin'

const root = resolve(import.meta.dirname, '..')
checkAntigravityPlugin({
  sourceDirectory: resolve(root, 'plugins/agent-plugin'),
  outputDirectory: resolve(root, 'dist/antigravity-plugin'),
  licenseFile: resolve(root, 'LICENSE'),
})
process.stdout.write('ok - Antigravity plugin directory and ZIP match the canonical sources\n')
