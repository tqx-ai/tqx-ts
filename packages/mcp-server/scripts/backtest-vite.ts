import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import type { Plugin, InlineConfig } from 'vite'

export const uiRoot = fileURLToPath(new URL('../src/ui/qube/backtest/', import.meta.url))

const productionBoundary: Plugin = {
  name: 'tqx-backtest-production-boundary',
  apply: 'build',
  generateBundle() {
    for (const id of this.getModuleIds()) {
      if (
        /(?:\/src\/ui\/qube\/backtest\/dev\/|\/adapters\/fixture\.|\/auth\/|\/gateway\.|\/server\.|\/tools\/)/.test(
          id,
        )
      )
        this.error('Server or development code entered the production App bundle')
    }
  },
}

export { default as backtestVuePlugin } from '@vitejs/plugin-vue'

export function backtestViteConfig(): InlineConfig {
  return {
    configFile: false,
    root: uiRoot,
    cacheDir: fileURLToPath(new URL('../node_modules/.vite/backtest/', import.meta.url)),
    publicDir: false,
    envDir: false,
    logLevel: 'warn',
    plugins: [vue(), viteSingleFile(), productionBoundary],
    build: { target: 'es2023', sourcemap: false, write: false },
  }
}
