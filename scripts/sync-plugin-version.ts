import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rootPackagePath = resolve(root, 'package.json')
const pluginManifestPath = resolve(root, 'plugins/agent-plugin/plugin.json')

const rootPackage = readJson(rootPackagePath)
const pluginManifest = readJson(pluginManifestPath)

pluginManifest.version = rootPackage.version
writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`)
process.stdout.write(`ok - Agent Plugin version is ${rootPackage.version}\n`)

function readJson(path: string): VersionedJson {
  return JSON.parse(readFileSync(path, 'utf8')) as VersionedJson
}

interface VersionedJson {
  [key: string]: unknown
  version: string
}
