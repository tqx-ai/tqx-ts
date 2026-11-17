import { AsyncLocalStorage } from 'node:async_hooks'
import { Logger, type ILogObj, type ISettingsParam } from 'tslog'

export interface LogContext {
  requestId: string
  rpcId?: string | number
  rpcMethod?: string
  targetName?: string
  protocolVersion?: string
  clientName?: string
  clientVersion?: string
  clientId?: string
}

export const logContext = new AsyncLocalStorage<LogContext>()
const levels = ['silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal']
const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
})

export function formatShanghaiTimestamp(date: Date): { pretty: string; iso: string } {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { pretty: '---- -- -- --:--:--.---', iso: 'Invalid Date' }
  }
  const parts = Object.fromEntries(
    shanghaiDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  const datePart = `${parts.year}-${parts.month}-${parts.day}`
  const timePart = `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`
  return {
    pretty: `${datePart} ${timePart}`,
    iso: `${datePart}T${timePart}+08:00`,
  }
}

export function resolvePrettyColor(noColor: string | undefined = process.env.NO_COLOR): boolean {
  return noColor === undefined || noColor === ''
}

export function createLogger(settings: ISettingsParam<ILogObj> = {}): Logger<ILogObj> {
  const level = levels.indexOf(process.env.MCP_LOG_LEVEL?.trim().toLowerCase() ?? 'info')
  const format = process.env.MCP_LOG_FORMAT?.trim().toLowerCase()
  const prettyColor = resolvePrettyColor()
  return new Logger<ILogObj>({
    name: 'tqx-mcp-server',
    minLevel: level < 0 ? 3 : level,
    type:
      format === 'json' || format === 'pretty'
        ? format
        : process.env.NODE_ENV === 'production'
          ? 'json'
          : process.env.VITEST
            ? 'hidden'
            : 'pretty',
    stack: { capture: 'off' },
    contextStorage: logContext,
    json: {
      numericLevel: false,
      time: (date) => formatShanghaiTimestamp(date).iso,
    },
    pretty: {
      style: prettyColor,
      template: '{{timestamp}} {{level}} [{{name}}]{{requestId}} ',
      placeholders: {
        timestamp: (meta) => formatShanghaiTimestamp(meta.date).pretty,
        level: (meta) => meta.logLevelName.padEnd(5),
        requestId: (meta) => {
          const requestId = (meta as Record<string, unknown>).requestId
          return typeof requestId === 'string' && requestId.length > 0 ? ` [${requestId}]` : ''
        },
      },
      styles: {
        timestamp: 'dim',
        name: ['cyan', 'bold'],
        requestId: 'dim',
        level: {
          '*': ['bold', 'white'],
          SILLY: ['dim', 'white'],
          TRACE: ['dim', 'cyan'],
          DEBUG: ['bold', 'green'],
          INFO: ['bold', 'blueBright'],
          WARN: ['bold', 'yellowBright'],
          ERROR: ['bold', 'redBright'],
          FATAL: ['bold', 'bgRed', 'whiteBright'],
        },
      },
      inspectOptions: {
        colors: prettyColor,
        compact: false,
        depth: Infinity,
      },
    },
    mask: {
      keys: [
        'authorization',
        'token',
        'accessToken',
        'access_token',
        'refreshToken',
        'refresh_token',
        'subjectToken',
        'subject_token',
        'clientSecret',
        'client_secret',
        'password',
        'secret',
        'privateKey',
        'codeVerifier',
        'code_verifier',
        'cookie',
        'set-cookie',
      ],
      caseInsensitive: true,
      placeholder: '[REDACTED]',
    },
    ...settings,
  })
}

export const logger = createLogger()
const children = new Map<string, Logger<ILogObj>>()

export function getLogger(name: string): Logger<ILogObj> {
  let child = children.get(name)
  if (!child) {
    child = logger.getSubLogger({ name })
    children.set(name, child)
  }
  return child
}

/** Bound client-controlled labels before placing them in structured logs. */
export function logLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted labels.
  return value.slice(0, 128).replace(/[\u0000-\u001f\u007f]/g, '')
}
