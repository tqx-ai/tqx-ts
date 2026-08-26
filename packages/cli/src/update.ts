import { createHash } from 'node:crypto'
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { getRuntimeEnvironment, getRuntimeProcess, type RuntimeProcess } from './utils/runtime'

const DEFAULT_RELEASES_URL = 'https://api.github.com/repos/tqx-ai/tqx-ts/releases'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
const CLI_PACKAGE = '@tqx-ai/cli'

export type UpdateMethod = 'standalone' | 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface ReleaseInfo {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: ReleaseAsset[]
}

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  update_available: boolean
  release?: ReleaseInfo
  checked: boolean
}

export interface UpdateResult {
  updated: boolean
  current_version: string
  latest_version: string
  method: UpdateMethod
  install_path: string | null
  pending_restart?: boolean
}

export interface UpdateFileOps {
  readFile: typeof readFile
  writeFile: typeof writeFile
  stat: typeof stat
  chmod: typeof chmod
  rename: typeof rename
  unlink: typeof unlink
  mkdir: typeof mkdir
}

export interface UpdateDependencies {
  environment?: NodeJS.ProcessEnv
  process?: RuntimeProcess
  fetch?: typeof globalThis.fetch
  now?: () => number
  fileOps?: Partial<UpdateFileOps>
  spawn?: typeof nodeSpawn
  timeoutMs?: number
}

interface ResolvedUpdateDependencies {
  environment: NodeJS.ProcessEnv
  process: RuntimeProcess
  fetch: typeof globalThis.fetch
  now: () => number
  fileOps: UpdateFileOps
  spawn: typeof nodeSpawn
  timeoutMs?: number
}

export class UpdateError extends Error {
  readonly status?: number
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options)
    this.name = 'UpdateError'
    this.status = options?.status
  }
}

export async function checkForUpdates(
  options: UpdateDependencies & { force?: boolean; version?: string } = {},
): Promise<UpdateCheckResult> {
  const deps = resolveDependencies(options)
  const currentVersion = __TQX_BUILD_CLI_VERSION__.trim()
  const statePath = updateStatePath(deps.environment, deps.process)
  const now = deps.now()

  if (!options.force) {
    const cached = await readCheckState(statePath, deps.fileOps!)
    if (cached && now - cached.checked_at < CHECK_INTERVAL_MS) {
      try {
        const latest =
          cached.latest_version ??
          (cached.release ? normalizeVersion(cached.release.tag_name) : currentVersion)
        if (
          !cached.release ||
          (!cached.release.draft &&
            !cached.release.prerelease &&
            isStableVersion(cached.release.tag_name))
        )
          return {
            current_version: currentVersion,
            latest_version: latest,
            update_available: compareVersions(latest, currentVersion) > 0,
            release: cached.release,
            checked: false,
          }
      } catch {
        // Ignore malformed legacy cache and refresh metadata.
      }
    }
  }

  try {
    await writeCheckTimestamp(statePath, now, deps.fileOps, deps.process.pid)
  } catch {
    // Update checks remain usable when the config directory is read-only.
  }
  const releases = await fetchReleases(deps, options.version)
  const release = options.version
    ? selectRequestedRelease(releases, options.version)
    : selectStableRelease(releases)
  if (!release)
    throw new UpdateError(
      options.version ? `Release ${options.version} was not found` : 'No stable release was found',
    )
  const latestVersion = normalizeVersion(release.tag_name)
  try {
    await writeCheckTimestamp(
      statePath,
      now,
      deps.fileOps,
      deps.process.pid,
      options.version ? undefined : latestVersion,
      options.version ? undefined : release,
    )
  } catch {
    // Metadata caching is best effort.
  }
  return {
    current_version: currentVersion,
    latest_version: latestVersion,
    update_available: options.version
      ? latestVersion !== currentVersion
      : compareVersions(latestVersion, currentVersion) > 0,
    release,
    checked: true,
  }
}

export async function runUpdate(
  check: UpdateCheckResult,
  dependencies: UpdateDependencies = {},
): Promise<UpdateResult> {
  const detected = detectMethod(dependencies)
  if (!check.update_available) {
    return {
      updated: false,
      current_version: check.current_version,
      latest_version: check.latest_version,
      method: detected.method,
      install_path: detected.method === 'standalone' ? detected.path : null,
    }
  }
  if (!check.release)
    throw new UpdateError(
      'Update release metadata is unavailable; run tqx self-update --check again.',
    )
  const resolvedCheck = { ...check, release: check.release }
  if (detected.method === 'standalone')
    return updateStandalone(resolvedCheck, dependencies, detected.path)
  return updatePackage(resolvedCheck, dependencies, detected.method, detected.path)
}

export function shouldAutoCheck(args: string[]): boolean {
  if (args[0] === 'self-update') return false
  return !args.some(
    (arg) =>
      arg === '--help' ||
      arg === '--version' ||
      arg.startsWith('--version=') ||
      arg === '-h' ||
      arg === '-v',
  )
}

function resolveDependencies(input: UpdateDependencies): ResolvedUpdateDependencies {
  return {
    environment: input.environment ?? getRuntimeEnvironment(),
    process: input.process ?? getRuntimeProcess(),
    fetch: input.fetch ?? globalThis.fetch,
    now: input.now ?? (() => Date.now()),
    fileOps: {
      readFile,
      writeFile,
      stat,
      chmod,
      rename,
      unlink,
      mkdir,
      ...input.fileOps,
    } as UpdateFileOps,
    spawn: input.spawn ?? nodeSpawn,
    timeoutMs: input.timeoutMs,
  }
}

async function fetchReleases(
  deps: ResolvedUpdateDependencies,
  requested?: string,
): Promise<ReleaseInfo[]> {
  const base = deps.environment.TQX_UPDATE_RELEASES_URL?.trim() || DEFAULT_RELEASES_URL
  const url = requested
    ? `${base.replace(/\/$/, '')}/tags/${encodeURIComponent(requested.startsWith('v') ? requested : `v${requested}`)}`
    : `${base}?per_page=100`
  const token = deps.environment.GH_TOKEN?.trim() || deps.environment.GITHUB_TOKEN?.trim()
  const isGithub = (() => {
    try {
      return new URL(url).hostname.toLowerCase() === 'api.github.com'
    } catch {
      return false
    }
  })()
  let response: Response
  try {
    response = await deps.fetch(url, {
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `@tqx-ai/cli/${__TQX_BUILD_CLI_VERSION__}`,
        ...(token && isGithub ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
  } catch (error) {
    throw new UpdateError(
      'Unable to check for updates. The Node.js fetch client does not automatically use HTTPS_PROXY; configure a proxy-aware environment or use tqx self-update later.',
      { cause: error },
    )
  }
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const reset = response.headers.get('x-ratelimit-reset')
    const suffix =
      response.status === 403 && remaining === '0'
        ? ` GitHub API rate limit exhausted${reset ? `; resets at ${new Date(Number(reset) * 1000).toISOString()}` : ''}.`
        : ''
    throw new UpdateError(`Update check failed with HTTP ${response.status}.${suffix}`, {
      status: response.status,
    })
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new UpdateError('GitHub releases response was not valid JSON', { cause: error })
  }
  if (requested) return [parseRelease(payload)]
  if (!Array.isArray(payload)) throw new UpdateError('GitHub releases response was invalid')
  return payload.map(parseRelease)
}

function parseRelease(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object')
    throw new UpdateError('GitHub release response was invalid')
  const item = value as Record<string, unknown>
  if (typeof item.tag_name !== 'string' || !Array.isArray(item.assets))
    throw new UpdateError('GitHub release response was invalid')
  return {
    tag_name: item.tag_name,
    draft: item.draft === true,
    prerelease: item.prerelease === true,
    assets: item.assets.flatMap((asset) => {
      if (!asset || typeof asset !== 'object') return []
      const record = asset as Record<string, unknown>
      return typeof record.name === 'string' && typeof record.browser_download_url === 'string'
        ? [{ name: record.name, browser_download_url: record.browser_download_url }]
        : []
    }),
  }
}

function selectStableRelease(releases: ReleaseInfo[]): ReleaseInfo | null {
  return (
    releases
      .filter(
        (release) => !release.draft && !release.prerelease && isStableVersion(release.tag_name),
      )
      .toSorted((a, b) =>
        compareVersions(normalizeVersion(b.tag_name), normalizeVersion(a.tag_name)),
      )[0] ?? null
  )
}

function selectRequestedRelease(releases: ReleaseInfo[], version: string): ReleaseInfo | null {
  const wanted = normalizeVersion(version)
  return (
    releases.find((release) => !release.draft && normalizeVersion(release.tag_name) === wanted) ??
    null
  )
}

function isStableVersion(value: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(value)
}

function normalizeVersion(value: string): string {
  const normalized = value.trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized))
    throw new UpdateError(`Invalid version: ${value}`)
  return normalized
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [core, prerelease] = normalizeVersion(value).split('-', 2)
    return { core: core!.split('.').map(Number), prerelease }
  }
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1)
    if (left.core[index]! !== right.core[index]!) return left.core[index]! - right.core[index]!
  if (left.prerelease === right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease.localeCompare(right.prerelease, 'en', { numeric: true })
}

function detectMethod(input: UpdateDependencies): { method: UpdateMethod; path: string } {
  const process = input.process ?? getRuntimeProcess()
  const executable = process.execPath
  const executableName = basename(executable).toLowerCase()
  const scriptPath = process.argv[1] ?? executable
  if (!['node', 'node.exe', 'bun', 'bun.exe'].includes(executableName))
    return { method: 'standalone', path: executable }
  if (/(?:_npx|bunx|pnpm[\\/]dlx|\.cache[\\/](?:npm|pnpm|bun))/i.test(scriptPath))
    throw new UpdateError(
      'This CLI is running from a temporary npx/bunx/pnpm dlx cache. Install @tqx-ai/cli globally before updating.',
    )
  const lower = scriptPath.toLowerCase()
  const segments = lower.split(/[\\/]+/)
  if (segments.includes('pnpm')) return { method: 'pnpm', path: scriptPath }
  if (segments.includes('yarn') || segments.includes('.yarn'))
    return { method: 'yarn', path: scriptPath }
  if (segments.includes('bun') || /[\\/]\.bun[\\/]install[\\/]global[\\/]/.test(lower))
    return { method: 'bun', path: scriptPath }
  return { method: 'npm', path: scriptPath }
}

async function updatePackage(
  check: UpdateCheckResult & { release: ReleaseInfo },
  deps: UpdateDependencies,
  method: UpdateMethod,
  path: string,
): Promise<UpdateResult> {
  if (
    method === 'yarn' &&
    /\.yarn[\\/](?:releases|berry|cache)|[\\/]\.pnp\.(?:cjs|js|mjs)$/i.test(path)
  )
    throw new UpdateError(
      'Yarn Berry does not support global add. Run npm install --global @tqx-ai/cli@' +
        check.latest_version +
        ' manually.',
    )
  const command = method === 'npm' ? 'npm' : method
  const args =
    method === 'npm'
      ? ['install', '--global', `${CLI_PACKAGE}@${check.latest_version}`]
      : method === 'pnpm'
        ? ['add', '--global', `${CLI_PACKAGE}@${check.latest_version}`]
        : method === 'yarn'
          ? ['global', 'add', `${CLI_PACKAGE}@${check.latest_version}`]
          : ['add', '--global', `${CLI_PACKAGE}@${check.latest_version}`]
  const binPath = await queryGlobalBinPath(method as Exclude<UpdateMethod, 'standalone'>, deps)
  if (!binPath) {
    const setupHint =
      method === 'pnpm'
        ? ' Check pnpm setup and its configured global bin directory (run pnpm setup).'
        : ''
    throw new UpdateError(
      `Unable to determine the ${method} global bin path; refusing to install without being able to verify the updated tqx executable.${setupHint}`,
    )
  }
  try {
    await runProcess(command, args, deps)
  } catch (error) {
    if (method === 'pnpm')
      throw new UpdateError(
        `${error instanceof Error ? error.message : String(error)} Check pnpm setup and its configured global bin directory (run pnpm setup).`,
        { cause: error },
      )
    throw error
  }
  const verified = await runProcess(binPath, ['--version'], deps, true)
  if (verified.trim() !== check.latest_version)
    throw new UpdateError(
      `Package manager completed, but ${binPath} reports version ${verified.trim() || 'unknown'} instead of ${check.latest_version}.`,
    )
  return {
    updated: true,
    current_version: check.current_version,
    latest_version: check.latest_version,
    method,
    install_path: binPath,
  }
}

async function queryGlobalBinPath(
  method: Exclude<UpdateMethod, 'standalone'>,
  deps: UpdateDependencies,
): Promise<string | null> {
  const runtime = deps.process ?? getRuntimeProcess()
  const executable = runtime.platform === 'win32' ? 'tqx.cmd' : 'tqx'
  const query =
    method === 'npm'
      ? ['prefix', '-g']
      : method === 'pnpm'
        ? ['bin', '-g']
        : method === 'bun'
          ? ['pm', 'bin', '-g']
          : ['global', 'bin']
  try {
    const directory = (
      await runProcess(method === 'npm' ? 'npm' : method, query, deps, true)
    ).trim()
    if (!directory) return null
    return method === 'npm' && runtime.platform !== 'win32'
      ? join(directory, 'bin', executable)
      : join(directory, executable)
  } catch {
    return null
  }
}

async function updateStandalone(
  check: UpdateCheckResult & { release: ReleaseInfo },
  deps: UpdateDependencies,
  targetPath: string,
): Promise<UpdateResult> {
  const process = deps.process ?? getRuntimeProcess()
  const platform =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'macos'
        : process.platform === 'linux'
          ? 'linux'
          : null
  const arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null
  if (!platform || !arch || (platform === 'windows' && arch !== 'x64'))
    throw new UpdateError(
      `Standalone updates are unavailable for ${process.platform}/${process.arch}.`,
    )
  const expectedName = `tqx-v${check.latest_version}-${platform}-${arch}${platform === 'windows' ? '.exe' : ''}`
  const asset = check.release.assets.find((item) => item.name === expectedName)
  const sums = check.release.assets.find((item) => item.name === 'SHA256SUMS')
  if (!asset || !sums)
    throw new UpdateError(
      `Release ${check.latest_version} is missing ${expectedName} or SHA256SUMS.`,
    )
  const fileOps = resolveDependencies(deps).fileOps
  const temporaryPath = `${targetPath}.${process.pid}.${(deps.now ?? Date.now)()}.tmp`
  try {
    const binary = await download(asset.browser_download_url, deps)
    const checksumText = await downloadText(sums.browser_download_url, deps)
    const expectedHash = checksumText
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/, 2))
      .find((parts) => parts[1] === asset.name)?.[0]
    const actualHash = createHash('sha256').update(binary).digest('hex')
    if (!expectedHash || expectedHash.toLowerCase() !== actualHash)
      throw new UpdateError(`SHA256 checksum mismatch for ${asset.name}.`)
    const existingMode = await fileOps
      .stat(targetPath)
      .then((value) => value.mode & 0o777)
      .catch(() => 0o755)
    await fileOps.writeFile(temporaryPath, binary, { mode: existingMode })
    await fileOps.chmod(temporaryPath, existingMode)
    const version = await runProcess(temporaryPath, ['--version'], deps, true)
    if (version.trim() !== check.latest_version)
      throw new UpdateError(
        `Downloaded binary reports version ${version.trim() || 'unknown'} instead of ${check.latest_version}.`,
      )
    if (platform === 'windows') {
      await scheduleWindowsReplacement(temporaryPath, targetPath, deps, check.latest_version)
      return {
        updated: false,
        pending_restart: true,
        current_version: check.current_version,
        latest_version: check.latest_version,
        method: 'standalone',
        install_path: targetPath,
      }
    }
    await fileOps.rename(temporaryPath, targetPath)
    return {
      updated: true,
      current_version: check.current_version,
      latest_version: check.latest_version,
      method: 'standalone',
      install_path: targetPath,
    }
  } catch (error) {
    await fileOps.unlink(temporaryPath).catch(() => undefined)
    if (error instanceof UpdateError)
      throw new UpdateError(
        `${error.message} Install version ${check.latest_version} manually from the release assets.`,
        {
          cause: error,
          status: error.status,
        },
      )
    throw new UpdateError(
      `Unable to replace ${targetPath}. Install version ${check.latest_version} manually from the release assets.`,
      { cause: error },
    )
  }
}

async function download(url: string, deps: UpdateDependencies): Promise<Buffer> {
  const response = await request(url, deps)
  return Buffer.from(await response.arrayBuffer())
}

async function downloadText(url: string, deps: UpdateDependencies): Promise<string> {
  const response = await request(url, deps)
  return response.text()
}

async function request(url: string, deps: UpdateDependencies): Promise<Response> {
  try {
    const environment = deps.environment ?? getRuntimeEnvironment()
    const token = environment.GH_TOKEN?.trim() || environment.GITHUB_TOKEN?.trim()
    const response = await (deps.fetch ?? globalThis.fetch)(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `@tqx-ai/cli/${__TQX_BUILD_CLI_VERSION__}`,
        ...(token &&
        (() => {
          try {
            return new URL(url).hostname.toLowerCase() === 'api.github.com'
          } catch {
            return false
          }
        })()
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
    })
    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      const reset = response.headers.get('x-ratelimit-reset')
      const suffix =
        response.status === 403 && remaining === '0'
          ? ` GitHub API rate limit exhausted${reset ? `; resets at ${new Date(Number(reset) * 1000).toISOString()}` : ''}.`
          : ''
      throw new UpdateError(`Download failed with HTTP ${response.status}.${suffix}`, {
        status: response.status,
      })
    }
    return response
  } catch (error) {
    if (error instanceof UpdateError) throw error
    throw new UpdateError(
      'Update download timed out or failed. Check network access and HTTPS_PROXY configuration.',
      { cause: error },
    )
  }
}

function runProcess(
  command: string,
  args: string[],
  deps: UpdateDependencies,
  capture = false,
): Promise<string> {
  const spawn = deps.spawn ?? nodeSpawn
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) =>
      reject(new UpdateError(`Failed to run ${command}: ${error.message}`, { cause: error })),
    )
    child.on('close', (code) =>
      code === 0
        ? (() => {
            if (!capture && (stdout || stderr)) {
              const output = deps.process?.stderr ?? getRuntimeProcess().stderr
              output.write(`${stdout}${stderr}`)
            }
            resolve(stdout)
          })()
        : reject(
            new UpdateError(
              `${command} failed with exit code ${code ?? 1}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
            ),
          ),
    )
  })
}

async function scheduleWindowsReplacement(
  temp: string,
  target: string,
  deps: UpdateDependencies,
  version: string,
): Promise<void> {
  const process = deps.process ?? getRuntimeProcess()
  const timestamp = (deps.now ?? (() => Date.now()))()
  const helper = `${target}.${process.pid}.${timestamp}.cmd`
  const log = `${target}.${process.pid}.${timestamp}.update.log`
  const content = `@echo off\r\necho TQX update helper started>>"${log}"\r\nfor /L %%N in (1,1,20) do (\r\n  move /Y "${temp}" "${target}" >nul 2>&1\r\n  if not exist "${temp}" goto success\r\n  echo replacement attempt %%N failed>>"${log}"\r\n  ping 127.0.0.1 -n 2 >nul\r\n)\r\necho TQX update failed after 20 attempts. Check permissions or antivirus.>>"${log}"\r\ngoto cleanup\r\n:success\r\necho TQX update completed>>"${log}"\r\ndel "${log}"\r\n:cleanup\r\ndel "%~f0"\r\n`
  const fileOps = resolveDependencies(deps).fileOps
  await fileOps.writeFile(helper, content, { encoding: 'utf8' })
  const spawn = deps.spawn ?? nodeSpawn
  try {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${helper}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } catch (error) {
    await fileOps.unlink(helper).catch(() => undefined)
    throw new UpdateError(
      `Unable to schedule Windows replacement. Install version ${version} manually from the release assets.`,
      { cause: error },
    )
  }
}

function updateStatePath(
  environment = getRuntimeEnvironment(),
  process = getRuntimeProcess(),
): string {
  const root =
    process.platform === 'win32'
      ? environment.LOCALAPPDATA?.trim() ||
        environment.APPDATA?.trim() ||
        join(homedir(), 'AppData', 'Local')
      : environment.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
  return join(root, 'tqx', 'update-check.json')
}

interface CheckState {
  checked_at: number
  latest_version?: string
  release?: ReleaseInfo
}

async function readCheckState(path: string, fileOps: UpdateFileOps): Promise<CheckState | null> {
  try {
    const parsed = JSON.parse(
      (await fileOps.readFile(path, 'utf8')) as unknown as string,
    ) as CheckState
    return typeof parsed.checked_at === 'number' ? parsed : null
  } catch {
    return null
  }
}

async function writeCheckTimestamp(
  path: string,
  timestamp: number,
  fileOps: UpdateFileOps,
  pid: number,
  latestVersion?: string,
  release?: ReleaseInfo,
): Promise<void> {
  const directory = dirname(path)
  await fileOps.mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${pid}.${timestamp}.tmp`
  try {
    await fileOps.writeFile(
      temporary,
      `${JSON.stringify({ checked_at: timestamp, ...(latestVersion ? { latest_version: latestVersion } : {}), ...(release ? { release } : {}) })}\n`,
      { mode: 0o600 },
    )
    await fileOps.rename(temporary, path)
  } finally {
    await fileOps.unlink(temporary).catch(() => undefined)
  }
}
