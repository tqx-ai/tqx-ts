import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { zipSync } from 'fflate'

interface ClaudePluginOptions {
  sourceDirectory: string
  outputDirectory: string
  licenseFile: string
}

type PluginFiles = Record<string, Uint8Array>
type JsonObject = Record<string, unknown>

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

export function buildClaudePlugin(options: ClaudePluginOptions): string {
  assertSeparateOutput(options)
  // Read and validate all inputs before replacing an existing distribution.
  const files = createClaudePluginFiles(options)
  const archive = archiveFiles(files)
  rmSync(options.outputDirectory, { recursive: true, force: true })
  for (const [name, content] of Object.entries(files)) {
    const path = resolve(options.outputDirectory, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const archivePath = `${options.outputDirectory}.zip`
  writeFileSync(archivePath, archive)
  return archivePath
}

export function checkClaudePlugin(options: ClaudePluginOptions): void {
  assertSeparateOutput(options)
  const expected = createClaudePluginFiles(options)
  const actual: PluginFiles = {}
  readTree(options.outputDirectory, '', actual)
  if (
    Object.keys(expected).toSorted().join('\n') !== Object.keys(actual).toSorted().join('\n') ||
    Object.entries(expected).some(([name, content]) => !Buffer.from(content).equals(actual[name]!))
  ) {
    throw new Error('Claude plugin directory is stale; run bun run plugin:claude:build')
  }
  if (!readFileSync(`${options.outputDirectory}.zip`).equals(archiveFiles(expected))) {
    throw new Error('Claude plugin ZIP is stale; run bun run plugin:claude:build')
  }
}

function createClaudePluginFiles(options: ClaudePluginOptions): PluginFiles {
  const source = realpathSync(options.sourceDirectory)
  const manifest = readJson(source, './plugin.json')
  const mcp = readJson(source, './mcp.json')
  if (manifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') {
    throw new Error('Claude plugin source must use the Agent Plugins 1.0.0 manifest schema')
  }
  if (mcp.$schema !== 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json') {
    throw new Error('Claude plugin source must use the Agent Plugins 1.0.0 MCP schema')
  }

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
  const servers: JsonObject = {}
  for (const [name, value] of Object.entries(objectValue(mcp.mcpServers, 'mcpServers'))) {
    const server = objectValue(value, `mcpServers.${name}`)
    if (server.type !== 'streamable-http') {
      throw new Error(`Claude distribution only adapts streamable-http MCP servers: ${name}`)
    }
    const url = new URL(stringValue(server.url, `mcpServers.${name}.url`))
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error(
        `Claude MCP server must use an HTTPS URL without credentials or fragments: ${name}`,
      )
    }
    const nativeServer: JsonObject = { type: 'http', url: server.url }
    if (server.headers !== undefined) {
      const headers = objectValue(server.headers, `mcpServers.${name}.headers`)
      for (const header of Object.values(headers)) stringValue(header, 'MCP header')
      nativeServer.headers = headers
    }
    servers[name] = nativeServer
  }

  const skillsDirectory = resolve(source, 'skills')
  if (!lstatSync(skillsDirectory).isDirectory()) {
    throw new Error('Skills source must be a regular directory')
  }
  let skillCount = 0
  for (const entry of readdirSync(skillsDirectory).toSorted()) {
    const path = resolve(skillsDirectory, entry)
    const kind = lstatSync(path)
    if (kind.isSymbolicLink()) throw new Error(`Cannot bundle a symbolic link: ${path}`)
    if (!kind.isDirectory() || ignoredSourceEntry(entry)) continue
    if (!readdirSync(path).includes('SKILL.md')) continue
    readTree(path, `skills/${entry}`, files, true)
    skillCount += 1
  }
  if (skillCount === 0) throw new Error('Claude distribution requires at least one packaged skill')

  files['.claude-plugin/plugin.json'] = jsonBytes(native)
  files['.mcp.json'] = jsonBytes({ mcpServers: servers })
  files['README.md'] = readSourceFile(source, './README.md')
  files.LICENSE = readFileSync(options.licenseFile)
  return files
}

function readTree(directory: string, prefix: string, files: PluginFiles, source = false): void {
  for (const name of readdirSync(directory).toSorted()) {
    if (source && ignoredSourceEntry(name)) continue
    const path = resolve(directory, name)
    const key = prefix ? `${prefix}/${name}` : name
    const kind = lstatSync(path)
    if (kind.isDirectory()) readTree(path, key, files, source)
    else if (kind.isFile()) files[key] = readFileSync(path)
    else throw new Error(`Cannot bundle a non-regular file: ${path}`)
  }
}

function ignoredSourceEntry(name: string): boolean {
  return (
    name.startsWith('.') ||
    ['__pycache__', 'node_modules', 'Thumbs.db', 'desktop.ini', '__MACOSX'].includes(name) ||
    /\.py[co]$/.test(name)
  )
}

function readSourceFile(root: string, path: string): Uint8Array {
  if (!path.startsWith('./') || !contained(root, resolve(root, path))) {
    throw new Error(`Plugin file must stay inside its source directory: ${path}`)
  }
  const resolved = resolve(root, path)
  if (!contained(root, realpathSync(resolved)) || !lstatSync(resolved).isFile()) {
    throw new Error(`Plugin file must be a contained regular file: ${path}`)
  }
  return readFileSync(resolved)
}

function assertSeparateOutput(options: ClaudePluginOptions): void {
  const source = realpathSync(options.sourceDirectory)
  const output = resolvedDestination(options.outputDirectory)
  if (contained(source, output) || contained(output, source)) {
    throw new Error('Claude distribution output must be separate from its source directory')
  }
}

function resolvedDestination(path: string): string {
  const absolute = resolve(path)
  return existsSync(absolute)
    ? realpathSync(absolute)
    : resolve(resolvedDestination(dirname(absolute)), basename(absolute))
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path)
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
}

function readJson(root: string, path: string): JsonObject {
  return objectValue(JSON.parse(Buffer.from(readSourceFile(root, path)).toString()), path)
}

function objectValue(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as JsonObject
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${name} must be a nonempty string`)
  return value
}

function jsonBytes(value: JsonObject): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function archiveFiles(files: PluginFiles): Uint8Array {
  return zipSync(files, { level: 9, mtime: new Date(2000, 0, 1) })
}
