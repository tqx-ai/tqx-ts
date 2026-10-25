export type McpEnvironment = 'local' | 'test' | 'prod'

export function mcpEnvironment(env: NodeJS.ProcessEnv): McpEnvironment {
  const name = env.TQX_ENV?.trim().toLowerCase()
  if (name === 'test') return 'test'
  if (name === 'prod' || name === 'pro' || name === 'production') return 'prod'
  // TQX_ENV was previously ignored. Missing/legacy/unknown values keep local behavior.
  return 'local'
}
export function mcpEnvironmentFile(environment: McpEnvironment): string {
  return `.env.${environment}`
}
function defined(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined))
}
export function mergeMcpEnvironment(
  inherited: NodeJS.ProcessEnv,
  local: NodeJS.ProcessEnv = {},
  selected: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return { ...defined(local), ...defined(selected), ...defined(inherited) }
}
