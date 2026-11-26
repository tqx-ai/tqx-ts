import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const rootPackagePath = resolve(root, 'package.json')
const pluginManifestPath = resolve(root, 'plugins/agent-plugin/plugin.json')
const pluginMcpPath = resolve(root, 'plugins/agent-plugin/mcp.json')
const claudeMarketplacePath = resolve(root, '.claude-plugin/marketplace.json')

const rootPackage = readJson(rootPackagePath)
const pluginManifest = readJson(pluginManifestPath)
const pluginMcp = JSON.parse(readFileSync(pluginMcpPath, 'utf8')) as {
  mcpServers: Record<string, { url: string; type: string; headers?: Record<string, string> }>
}
const claudeMarketplace = JSON.parse(readFileSync(claudeMarketplacePath, 'utf8')) as {
  plugins: (VersionedJson & { mcpServers: Record<string, unknown> })[]
}
const claudePlugin = claudeMarketplace.plugins.find((plugin) => plugin.name === pluginManifest.name)
if (!claudePlugin) throw new Error('Claude marketplace must include the Agent Plugin')
const tqxServer = pluginMcp.mcpServers.tqx
if (!tqxServer) throw new Error('Agent Plugin must include the TQX MCP server')

pluginManifest.version = rootPackage.version
claudePlugin.version = rootPackage.version
tqxServer.headers = {
  ...tqxServer.headers,
  'X-TQX-Skill-Bundle-Version': rootPackage.version,
}
claudePlugin.mcpServers.tqx = { ...tqxServer, type: 'http' }
writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`)
writeFileSync(pluginMcpPath, `${JSON.stringify(pluginMcp, null, 2)}\n`)
writeFileSync(claudeMarketplacePath, `${JSON.stringify(claudeMarketplace, null, 2)}\n`)
process.stdout.write(`ok - Agent Plugin version is ${rootPackage.version}\n`)
process.stdout.write(`ok - Claude marketplace plugin version is ${rootPackage.version}\n`)
process.stdout.write(`ok - MCP skill bundle version is ${rootPackage.version}\n`)

function readJson(path: string): VersionedJson {
  return JSON.parse(readFileSync(path, 'utf8')) as VersionedJson
}

interface VersionedJson {
  [key: string]: unknown
  version: string
}
