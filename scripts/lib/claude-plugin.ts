import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import {
  assertSeparateOutput,
  checkPluginDistribution,
  collectSkillFiles,
  collectStreamableHttpServers,
  jsonBytes,
  loadCanonicalPluginSource,
  objectValue,
  readSourceFile,
  stringValue,
  writePluginDistribution,
  type JsonObject,
  type PluginDistributionOptions,
  type PluginFiles,
} from './plugin-distribution'

const metadataFields = [
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
] as const

export function buildClaudePlugin(options: PluginDistributionOptions): string {
  assertSeparateOutput(options, 'Claude')
  // Read and validate all inputs before replacing an existing distribution.
  const files = createClaudePluginFiles(options)
  return writePluginDistribution(options, files)
}

export function checkClaudePlugin(options: PluginDistributionOptions): void {
  assertSeparateOutput(options, 'Claude')
  checkPluginDistribution(
    options,
    createClaudePluginFiles(options),
    'Claude',
    'bun run plugin:claude:build',
  )
}

function createClaudePluginFiles(options: PluginDistributionOptions): PluginFiles {
  const { source, manifest, mcp } = loadCanonicalPluginSource(options.sourceDirectory, 'Claude')

  const native: JsonObject = {}
  for (const field of metadataFields) {
    if (manifest[field] !== undefined) native[field] = manifest[field]
  }
  for (const field of ['name', 'version', 'description']) stringValue(native[field], field)
  stringValue(objectValue(native.author, 'author').name, 'author.name')

  const extensions = objectValue(manifest.extensions, 'extensions')
  const openai = objectValue(extensions['com.openai'], 'com.openai')
  const presentation = objectValue(openai.interface, 'com.openai.interface')
  for (const [from, to] of [
    ['displayName', 'displayName'],
    ['supportURL', 'supportUrl'],
    ['privacyPolicyURL', 'privacyPolicyUrl'],
    ['termsOfServiceURL', 'termsOfServiceUrl'],
  ] as const) {
    if (presentation[from] !== undefined) native[to] = stringValue(presentation[from], from)
  }

  const files: PluginFiles = {}
  if (presentation.logo !== undefined) {
    const logo = stringValue(presentation.logo, 'logo')
    native.icon = `./assets/${basename(logo)}`
    files[`assets/${basename(logo)}`] = readSourceFile(source, logo)
  }

  const servers = collectStreamableHttpServers(mcp, 'Claude', ({ url, headers }) =>
    headers ? { type: 'http', url, headers } : { type: 'http', url },
  )
  collectSkillFiles(source, files, 'Claude')

  files['.claude-plugin/plugin.json'] = jsonBytes(native)
  files['.mcp.json'] = jsonBytes({ mcpServers: servers })
  files['README.md'] = readSourceFile(source, './README.md')
  files.LICENSE = readFileSync(options.licenseFile)
  return files
}
