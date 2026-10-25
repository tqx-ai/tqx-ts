import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { loadConfig } from './config'
import { mcpEnvironment, mcpEnvironmentFile, mergeMcpEnvironment } from './environment'
import { installShutdownHandlers, startService } from './runtime'

try {
  const optionalEnvironment = (path: string): NodeJS.ProcessEnv => {
    try {
      return parseEnv(readFileSync(path, 'utf8'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {}
      throw error
    }
  }
  const inherited = { ...process.env }
  const local = optionalEnvironment('.env.local')
  const environment = mcpEnvironment(mergeMcpEnvironment(inherited, local))
  const selected =
    environment === 'local' ? {} : optionalEnvironment(mcpEnvironmentFile(environment))
  const effective = mergeMcpEnvironment(inherited, local, selected)
  for (const [name, value] of Object.entries(effective))
    if (value !== undefined) process.env[name] = value
  const config = loadConfig(effective)
  const service = await startService(config)
  const removeSignals = installShutdownHandlers(service.close)
  service.server.on('error', () => {
    console.error('MCP HTTP server failed')
    process.exitCode = 1
    removeSignals()
    void service.close()
  })
  console.info(`MCP listening at ${config.resource}; healthz checks process liveness only`)
  console.info(
    `MCP environment=${config.environment}; issuer=${config.issuer}; api=${config.apiResource}; trading=${config.tradingBaseUrl}`,
  )
} catch (error) {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  console.error(
    code === 'EADDRINUSE'
      ? 'MCP startup failed: port is already in use'
      : 'MCP startup failed: check runtime configuration and TLS files',
  )
  process.exitCode = 1
}
