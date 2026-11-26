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

const maxSuggestedPrompts = 3

export function buildAntigravityPlugin(options: PluginDistributionOptions): string {
  assertSeparateOutput(options, 'Antigravity')
  // Read and validate all inputs before replacing an existing distribution.
  const files = createAntigravityPluginFiles(options)
  return writePluginDistribution(options, files)
}

export function checkAntigravityPlugin(options: PluginDistributionOptions): void {
  assertSeparateOutput(options, 'Antigravity')
  checkPluginDistribution(
    options,
    createAntigravityPluginFiles(options),
    'Antigravity',
    'bun run plugin:antigravity:build',
  )
}

function createAntigravityPluginFiles(options: PluginDistributionOptions): PluginFiles {
  const { source, manifest, mcp } = loadCanonicalPluginSource(
    options.sourceDirectory,
    'Antigravity',
  )

  const native: JsonObject = {
    name: stringValue(manifest.name, 'name'),
    version: stringValue(manifest.version, 'version'),
    description: stringValue(manifest.description, 'description'),
  }

  const extensions = objectValue(manifest.extensions, 'extensions')
  const openai = objectValue(extensions['com.openai'], 'com.openai')
  const presentation = objectValue(openai.interface, 'com.openai.interface')

  if (presentation.displayName !== undefined) {
    native.displayName = stringValue(presentation.displayName, 'displayName')
  }

  if (manifest.author !== undefined) {
    if (typeof manifest.author === 'string') {
      native.author = stringValue(manifest.author, 'author')
    } else {
      const author = objectValue(manifest.author, 'author')
      const nativeAuthor: JsonObject = { name: stringValue(author.name, 'author.name') }
      if (author.url !== undefined) nativeAuthor.url = stringValue(author.url, 'author.url')
      native.author = nativeAuthor
    }
  }

  if (manifest.homepage !== undefined) {
    native.homepage = stringValue(manifest.homepage, 'homepage')
  }
  if (manifest.repository !== undefined) {
    native.repository =
      typeof manifest.repository === 'string'
        ? stringValue(manifest.repository, 'repository')
        : objectValue(manifest.repository, 'repository')
  }

  const files: PluginFiles = {}
  if (presentation.logo !== undefined) {
    const logo = stringValue(presentation.logo, 'logo')
    const logoPath = `assets/${basename(logo)}`
    native.logo = logoPath
    files[logoPath] = readSourceFile(source, logo)
  }

  if (presentation.defaultPrompt !== undefined) {
    if (!Array.isArray(presentation.defaultPrompt)) {
      throw new Error('defaultPrompt must be an array of strings')
    }
    const prompts = presentation.defaultPrompt
      .map((entry, index) => stringValue(entry, `defaultPrompt[${index}]`))
      .slice(0, maxSuggestedPrompts)
    if (prompts.length > 0) native.suggestedPrompts = prompts
  }

  const servers = collectStreamableHttpServers(mcp, 'Antigravity', ({ url, headers }) =>
    headers ? { url, headers } : { url },
  )
  collectSkillFiles(source, files, 'Antigravity')

  files['plugin.json'] = jsonBytes(native)
  files['mcp_config.json'] = jsonBytes({ mcpServers: servers })
  files['README.md'] = readSourceFile(source, './README.md')
  files.LICENSE = readFileSync(options.licenseFile)
  return files
}
