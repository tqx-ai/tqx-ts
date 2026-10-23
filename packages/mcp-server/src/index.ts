import { loadEnvFile } from 'node:process'
import { loadConfig } from './config'
import { installShutdownHandlers, startService } from './runtime'

try {
  // Bun also auto-loads .env.local; Node start uses the same optional runtime file.
  try {
    loadEnvFile('.env.local')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const config = loadConfig()
  const service = await startService(config)
  const removeSignals = installShutdownHandlers(service.close)
  service.server.on('error', () => {
    console.error('MCP HTTP server failed')
    process.exitCode = 1
    removeSignals()
    void service.close()
  })
  console.info(`MCP listening at ${config.resource}; healthz checks process liveness only`)
} catch (error) {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  console.error(
    code === 'EADDRINUSE'
      ? 'MCP startup failed: port is already in use'
      : 'MCP startup failed: check runtime configuration and TLS files',
  )
  process.exitCode = 1
}
