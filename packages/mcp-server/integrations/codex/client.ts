import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { assertClientIsolation, isolatedClientEnvironment, type LivePermit } from './local-policy'
import { closeOwnedProcess } from './owned-process'

export type RecordValue = Record<string, unknown>
export class CodexClient {
  lastFailure:
    | {
        code: unknown
        kind: string
        registrationDiagnostic?: string
        refreshDiagnostic?: string
        reasonHints: string[]
      }
    | undefined
  readonly process: ChildProcessWithoutNullStreams
  private sequence = 0
  private closed = false
  private pending = new Map<
    number,
    {
      resolve: (value: RecordValue) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  readonly notifications: { method: string; params: RecordValue }[] = []
  constructor(home: string, cwd: string, permit?: LivePermit) {
    assertClientIsolation(permit, home, cwd)
    const env = isolatedClientEnvironment(home)
    this.process = spawn(
      process.env.TQX_CODEX_BIN ?? 'codex',
      ['app-server', '--stdio', '--strict-config'],
      {
        cwd,
        env,
        stdio: 'pipe',
        windowsHide: true,
      },
    )
    // Never forward app-server logs: OAuth URLs and private diagnostics may occur.
    this.process.stderr.resume()
    createInterface({ input: this.process.stdout }).on('line', (line) => {
      let message: RecordValue
      try {
        message = JSON.parse(line) as RecordValue
      } catch {
        return
      }
      if (typeof message.id === 'number') {
        const waiter = this.pending.get(message.id)
        if (!waiter) return
        clearTimeout(waiter.timer)
        this.pending.delete(message.id)
        if (message.error) {
          const error = message.error as RecordValue
          this.lastFailure = {
            reasonHints: [
              'unsupported parameters for this grant',
              'invalid_grant',
              'invalid_request',
              'refresh',
              'Authentication required',
              'authentication required',
              'not found',
            ].filter((hint) => typeof error.message === 'string' && error.message.includes(hint)),
            code: typeof error.code === 'number' ? error.code : undefined,
            kind:
              typeof error.message === 'string' && error.message.includes('response_types')
                ? 'dcr_response_types_rejected'
                : 'rpc_rejected',
            ...(typeof error.message === 'string' && error.message.includes('Registration failed:')
              ? {
                  registrationDiagnostic: error.message.replace(/https?:[^ "\\]+/g, '[url]'),
                }
              : {}),
            ...(typeof error.message === 'string' && error.message.includes('refresh')
              ? {
                  refreshDiagnostic: error.message
                    .replace(/https?:[^ "\\]+/g, '[url]')
                    .replace(/[A-Za-z0-9_-]{24,}/g, '[opaque]'),
                }
              : {}),
          }
          waiter.reject(new Error('Codex RPC rejected request'))
        } else waiter.resolve(message.result as RecordValue)
      } else if (typeof message.method === 'string') {
        this.notifications.push({
          method: message.method,
          params: message.params as RecordValue,
        })
      }
    })
    this.process.on('error', () => this.rejectAll())
    this.process.on('exit', () => this.rejectAll())
  }
  private rejectAll() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Codex process stopped'))
    }
    this.pending.clear()
  }
  request(method: string, params: RecordValue = {}, timeoutMs = 25_000): Promise<RecordValue> {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex RPC timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.process.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }
  async initialize() {
    const response = await this.request('initialize', {
      clientInfo: { name: 'tqx_codex_compatibility', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    })
    this.process.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
    return response
  }
  async loginCompletion(loginId: unknown) {
    for (let i = 0; i < 320; i++) {
      const found = this.notifications.find(
        (n) => n.method === 'mcpServer/oauthLogin/completed' && n.params.loginId === loginId,
      )
      if (found) return found.params
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('No bounded OAuth completion notification')
  }
  async close() {
    if (this.closed) return
    this.closed = true
    this.rejectAll()
    await closeOwnedProcess(this.process)
  }
}
