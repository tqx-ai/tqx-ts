import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rootPackagePath = resolve(root, 'package.json')
const pluginManifestPath = resolve(root, 'plugins/agent-plugin/plugin.json')
const claudeMarketplacePath = resolve(root, '.claude-plugin/marketplace.json')

const rootPackage = readJson(rootPackagePath)
const pluginManifest = readJson(pluginManifestPath)
const claudeMarketplace = JSON.parse(readFileSync(claudeMarketplacePath, 'utf8')) as {
  plugins: VersionedJson[]
}
const claudePlugin = claudeMarketplace.plugins.find((plugin) => plugin.name === pluginManifest.name)
if (!claudePlugin) throw new Error('Claude marketplace must include the Agent Plugin')

pluginManifest.version = rootPackage.version
claudePlugin.version = rootPackage.version
writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`)
writeFileSync(claudeMarketplacePath, `${JSON.stringify(claudeMarketplace, null, 2)}\n`)
process.stdout.write(`ok - Agent Plugin version is ${rootPackage.version}\n`)
process.stdout.write(`ok - Claude marketplace plugin version is ${rootPackage.version}\n`)

function readJson(path: string): VersionedJson {
  return JSON.parse(readFileSync(path, 'utf8')) as VersionedJson
}

interface VersionedJson {
  [key: string]: unknown
  version: string
}
