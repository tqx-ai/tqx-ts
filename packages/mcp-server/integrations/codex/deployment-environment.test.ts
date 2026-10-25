import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'
import {
  compareDeploymentBinding,
  deploymentFiles,
  LOCAL_DEPLOYMENT,
  resolveDeployment,
  writeDeploymentSource,
} from './deployment-environment'

const remote = {
  resource: 'http://mcp.example.test/custom',
  issuer: 'http://as.example.test/legacy',
  webOrigin: 'http://web.example.test',
}
test('omitted selection preserves local defaults independently of NODE_ENV', () => {
  vi.stubEnv('NODE_ENV', 'production')
  try {
    expect(resolveDeployment()).toMatchObject({ environment: 'local', ...LOCAL_DEPLOYMENT })
  } finally {
    vi.unstubAllEnvs()
  }
})
for (const environment of ['test', 'prod'])
  test(`${environment} uses the original default chain when remote information is absent`, () => {
    expect(resolveDeployment({ environment })).toMatchObject({ environment, ...LOCAL_DEPLOYMENT })
    expect(resolveDeployment({ environment, resource: remote.resource })).toMatchObject({
      environment,
      resource: remote.resource,
      issuer: LOCAL_DEPLOYMENT.issuer,
      webOrigin: LOCAL_DEPLOYMENT.webOrigin,
    })
  })
test('explicit settings override existing public configuration, then defaults', () => {
  const existing = {
    environment: 'test',
    ...remote,
    server: 'tqx',
    plugin: 'tqx-trading-local',
    marketplace: 'tqx-local',
    version: '0.2.0',
  }
  expect(resolveDeployment({}, existing)).toMatchObject(existing)
  expect(resolveDeployment({}, existing).valueSources.resource).toBe('existing-public-config')
  expect(
    resolveDeployment({ environment: 'prod', resource: 'http://127.0.0.1:3004/mcp' }, existing),
  ).toMatchObject({ ...existing, environment: 'prod', resource: 'http://127.0.0.1:3004/mcp' })
})
test('legacy labels and addresses are displayed without newly imposed deployment URL gates', () => {
  expect(resolveDeployment({ environment: 'dev-pro', ...remote })).toMatchObject({
    environment: 'dev-pro',
    ...remote,
  })
  expect(resolveDeployment({ environment: 'prod', ...LOCAL_DEPLOYMENT })).toMatchObject({
    environment: 'prod',
    ...LOCAL_DEPLOYMENT,
  })
  expect(resolveDeployment({ environment: 'local', ...remote })).toMatchObject(remote)
})
test('new-source ID suggestions are stable but existing aliases do not need migration', () => {
  const selected = resolveDeployment({ environment: 'test', ...remote })
  expect(resolveDeployment({ environment: 'test', ...remote })).toEqual(selected)
  expect(resolveDeployment({ environment: 'prod', ...remote }).endpointId).not.toBe(
    selected.endpointId,
  )
  expect(
    resolveDeployment({
      server: 'tqx',
      plugin: 'tqx-trading-local',
      marketplace: 'tqx-local',
      version: '0.2.0',
    }),
  ).toMatchObject({
    server: 'tqx',
    plugin: 'tqx-trading-local',
    marketplace: 'tqx-local',
    version: '0.2.0',
  })
  expect(compareDeploymentBinding(selected, undefined)).toEqual({
    bindingAvailable: false,
    differences: [],
  })
  expect(
    compareDeploymentBinding(selected, { resource: 'http://different.example.test/mcp' })
      .differences,
  ).toContain('resource')
})
test('generation reuses matching source and preserves conflicts without an exclusive-directory gate', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  try {
    const work = fileURLToPath(new URL('./work/', import.meta.url))
    const parent = await mkdtemp(resolve(work, 'deployment-compatible-source-'))
    const source = resolve(parent, 'existing-source')
    const binding = resolveDeployment({ environment: 'test', ...remote })
    expect(await writeDeploymentSource(source, binding)).toBe(source)
    expect(await writeDeploymentSource(source, binding)).toBe(source)
    const mcpFile = resolve(source, `plugins/${binding.plugin}/mcp.json`)
    const original = await readFile(mcpFile, 'utf8')
    expect(JSON.parse(original)).toEqual(deploymentFiles(binding).mcp)
    await writeFile(resolve(source, 'preserve.txt'), 'unrelated source file')
    const other = await writeDeploymentSource(
      source,
      resolveDeployment({ environment: 'prod', ...remote }),
    )
    expect(other).not.toBe(source)
    expect(await readFile(mcpFile, 'utf8')).toBe(original)
    expect(await readFile(resolve(source, 'preserve.txt'), 'utf8')).toBe('unrelated source file')
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})
test('single MD contains exact helper/selector and matching local source templates', async () => {
  const base = fileURLToPath(new URL('./', import.meta.url))
  const md = await readFile(resolve(base, 'INSTALL_LOCAL_PLUGIN_WITH_CODEX.md'), 'utf8')
  const blocks = [...md.matchAll(/```javascript\r?\n([\s\S]*?)```/g)]
  expect(blocks).toHaveLength(2)
  for (const [index, name] of ['callback-login.mjs', 'deployment-environment.mjs'].entries())
    expect(blocks[index]![1]!.trimEnd()).toBe(
      (await readFile(resolve(base, name), 'utf8')).trimEnd(),
    )
  const json = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((item) => JSON.parse(item[1]!))
  const local = deploymentFiles(resolveDeployment())
  expect(json).toEqual([local.marketplace, local.plugin, local.mcp])
})
