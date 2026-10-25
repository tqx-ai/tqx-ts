import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export type DeploymentEnvironment = 'local' | 'test' | 'prod'
export interface DeploymentInput {
  environment?: string
  resource?: string
  issuer?: string
  webOrigin?: string
  server?: string
  plugin?: string
  marketplace?: string
  version?: string
}
export const LOCAL_DEPLOYMENT = {
  resource: 'http://127.0.0.1:3004/mcp',
  issuer: 'http://127.0.0.1:26825',
  webOrigin: 'http://127.0.0.1:3000',
} as const
export function resolveDeployment(input: DeploymentInput = {}, current: DeploymentInput = {}) {
  // Preserve the original client selection chain: explicit inputs, existing
  // public connection settings, then the known local defaults. Environment is
  // a displayed selection label; it does not establish a remote deployment.
  const environment = input.environment?.trim() || current.environment?.trim() || 'local'
  const tuple = {
    environment,
    resource: input.resource || current.resource || LOCAL_DEPLOYMENT.resource,
    issuer: input.issuer || current.issuer || LOCAL_DEPLOYMENT.issuer,
    webOrigin: input.webOrigin || current.webOrigin || LOCAL_DEPLOYMENT.webOrigin,
  }
  const endpointId = createHash('sha256').update(JSON.stringify(tuple)).digest('hex').slice(0, 32)
  const label =
    environment
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 8) || 'local'
  const suggested = `tqx-${label}-${endpointId}`
  const server = input.server || current.server || suggested
  return {
    schemaVersion: 1 as const,
    ...tuple,
    endpointId,
    server,
    plugin: input.plugin || current.plugin || `${suggested}-plugin`,
    marketplace: input.marketplace || current.marketplace || `${suggested}-market`,
    version: input.version || current.version || '0.3.0',
    valueSources: Object.fromEntries(
      ['environment', 'resource', 'issuer', 'webOrigin'].map((key) => [
        key,
        input[key as keyof DeploymentInput]
          ? 'explicit'
          : current[key as keyof DeploymentInput]
            ? 'existing-public-config'
            : 'local-default',
      ]),
    ),
  }
}
export type DeploymentBinding = ReturnType<typeof resolveDeployment>
export function compareDeploymentBinding(selected: DeploymentBinding, existing: unknown) {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing))
    return { bindingAvailable: false, differences: [] as string[] }
  const binding = existing as Record<string, unknown>
  const differences: string[] = []
  for (const key of [
    'environment',
    'resource',
    'issuer',
    'webOrigin',
    'server',
    'plugin',
    'marketplace',
    'version',
  ] as const)
    if (binding[key] !== undefined && binding[key] !== selected[key]) differences.push(key)
  return { bindingAvailable: true, differences }
}
export function deploymentFiles(binding: DeploymentBinding) {
  const { plugin, marketplace, server, resource, environment, version } = binding
  return {
    marketplace: {
      name: marketplace,
      interface: { displayName: `TQX ${environment} Plugins` },
      plugins: [
        {
          name: plugin,
          source: { source: 'local', path: `./plugins/${plugin}` },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    plugin: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: plugin,
      version,
      description: `Connect the explicitly selected TQX ${environment} MCP environment using your own Agent consent.`,
      author: { name: 'TQX' },
      extensions: {
        'com.openai': {
          requires_local_executor: true,
          interface: {
            displayName: `TQX Trading ${environment}`,
            shortDescription: 'TQX account and positions',
            longDescription: `Selected ${environment} deployment only. Preserve actual PAPER/LIVE mode and freshness. Begin with account and positions; accepted writes are not fills.`,
            developerName: 'TQX',
            category: 'Productivity',
            capabilities: ['Read', 'Write'],
            defaultPrompt:
              'Read my authorized Agent account and positions in this selected environment. Do not place, modify or cancel orders. Do not use another connection.',
          },
        },
      },
    },
    mcp: {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [server]: { type: 'streamable-http', url: resource } },
    },
  }
}
export async function writeDeploymentSource(directory: string, binding: DeploymentBinding) {
  let source = resolve(directory)
  const files = deploymentFiles(binding)
  const relativeFiles = [
    ['.agents/plugins/marketplace.json', files.marketplace],
    [`plugins/${binding.plugin}/plugin.json`, files.plugin],
    [`plugins/${binding.plugin}/mcp.json`, files.mcp],
    ['deployment-binding.json', binding],
  ] as const
  await mkdir(source, { recursive: true })
  // Reuse matching source; preserve conflicting files and generate a sibling
  // source within the requested directory instead of blocking or overwriting.
  for (const [name, value] of relativeFiles) {
    try {
      const previous = JSON.parse(await readFile(resolve(source, name), 'utf8')) as Record<
        string,
        unknown
      >
      const actual = { ...previous }
      const expected = { ...value }
      // Provenance can change from explicit/default to existing on the next
      // run. It describes this invocation, not a changed connection/package.
      if (name === 'deployment-binding.json') {
        delete actual.valueSources
        delete (expected as Record<string, unknown>).valueSources
      }
      if (!isDeepStrictEqual(actual, expected)) {
        source = await mkdtemp(resolve(source, 'tqx-source-'))
        break
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        source = await mkdtemp(resolve(source, 'tqx-source-'))
        break
      }
    }
  }
  const pluginDirectory = resolve(source, 'plugins', binding.plugin)
  await mkdir(resolve(source, '.agents', 'plugins'), { recursive: true })
  await mkdir(pluginDirectory, { recursive: true })
  const save = async (path: string, value: unknown) => {
    try {
      await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  await save(resolve(source, '.agents', 'plugins', 'marketplace.json'), files.marketplace)
  await save(resolve(pluginDirectory, 'plugin.json'), files.plugin)
  await save(resolve(pluginDirectory, 'mcp.json'), files.mcp)
  await save(resolve(source, 'deployment-binding.json'), binding)
  return source
}
async function main() {
  const values = new Map<string, string>()
  let plan = false
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!
    if (key === '--plan') {
      assert(!plan)
      plan = true
      continue
    }
    assert(
      [
        '--environment',
        '--mcp-url',
        '--issuer',
        '--web-origin',
        '--server',
        '--plugin',
        '--marketplace',
        '--version',
        '--config',
        '--output-dir',
      ].includes(key) &&
        !values.has(key) &&
        args[index + 1],
      'Invalid deployment arguments',
    )
    values.set(key, args[++index]!)
  }
  const current: DeploymentInput = values.has('--config')
    ? JSON.parse(await readFile(values.get('--config')!, 'utf8'))
    : {}
  const binding = resolveDeployment(
    {
      environment: values.get('--environment'),
      ...(values.has('--mcp-url') ? { resource: values.get('--mcp-url')! } : {}),
      ...(values.has('--issuer') ? { issuer: values.get('--issuer')! } : {}),
      ...(values.has('--web-origin') ? { webOrigin: values.get('--web-origin')! } : {}),
      ...(values.has('--server') ? { server: values.get('--server')! } : {}),
      ...(values.has('--plugin') ? { plugin: values.get('--plugin')! } : {}),
      ...(values.has('--marketplace') ? { marketplace: values.get('--marketplace')! } : {}),
      ...(values.has('--version') ? { version: values.get('--version')! } : {}),
    },
    current,
  )
  if (plan || !values.has('--output-dir')) {
    console.log(
      JSON.stringify({
        event: 'tqx_environment_plan',
        binding,
        files: deploymentFiles(binding),
        installed: false,
      }),
    )
    return
  }
  const output = values.get('--output-dir')!
  const source = await writeDeploymentSource(output, binding)
  console.log(
    JSON.stringify({
      event: 'tqx_environment_source_generated',
      source,
      binding,
      pluginRef: `plugin://${binding.plugin}@${binding.marketplace}`,
      installed: false,
      loginStarted: false,
    }),
  )
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main().catch(() => {
    console.error(
      'TQX source generation could not complete; check command syntax and source files. Existing connections were not changed.',
    )
    process.exitCode = 1
  })
