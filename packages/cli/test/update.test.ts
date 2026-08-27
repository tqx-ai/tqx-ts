import type { spawn as nodeSpawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCli } from '../src/command'
import { checkForUpdates, runUpdate, shouldAutoCheck, type ReleaseInfo } from '../src/update'
import type { RuntimeProcess } from '../src/utils/runtime'

function runtime(overrides: Partial<RuntimeProcess> = {}): RuntimeProcess {
  return {
    argv: ['tqx', '/tmp/node_modules/@tqx-ai/cli/dist/index.mjs'],
    execPath: '/usr/local/bin/node',
    arch: 'x64',
    env: {},
    pid: 123,
    platform: 'linux',
    stdout: { write() {} },
    stderr: { write() {} },
    ...overrides,
  }
}

function release(tag_name: string, overrides: Partial<ReleaseInfo> = {}): ReleaseInfo {
  return {
    tag_name,
    draft: false,
    prerelease: false,
    assets: [],
    ...overrides,
  }
}

function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  })
}

function completedChild(stdout: string) {
  const child = fakeChild()
  setTimeout(() => {
    child.stdout.emit('data', stdout)
    child.emit('close', 0)
  }, 0)
  return Object.assign(child, { kill: vi.fn() })
}

function hangingChild() {
  const child = fakeChild()
  // Never closes on its own; only a signal ends it.
  return Object.assign(child, {
    kill: vi.fn(() => {
      setTimeout(() => child.emit('close', null), 0)
      return true
    }),
  })
}

afterEach(() => vi.restoreAllMocks())

describe('CLI updates', () => {
  it('starts automatic checks without delaying the business command', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const stdout = {
      value: '',
      write(chunk: string) {
        this.value += chunk
      },
    }
    let releaseCheck!: (response: Response) => void
    const updateFetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((resolve) => {
          releaseCheck = resolve
        }),
    )
    const businessFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        code: '0',
        message: 'success',
        data: { status: 'ok', service: 'api', version: '1' },
        request_id: null,
        timestamp: 1,
      }),
    )

    await runCli(['status', '--plain'], {
      environment: { TQX_BASE_URL: 'https://api.example.test', XDG_CONFIG_HOME: directory },
      credentialStore: {
        get: async () => null,
        set: async () => undefined,
        delete: async () => false,
      },
      fetch: businessFetch,
      update: { fetch: updateFetch },
      autoUpdateCheck: true,
      stdout,
    })

    expect(businessFetch).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(updateFetch).toHaveBeenCalledTimes(1))
    releaseCheck(Response.json([]))
  })

  it('supports an explicit JSON-only update check', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const stdout = {
      value: '',
      write(chunk: string) {
        this.value += chunk
      },
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([release('v0.5.0')]))

    await runCli(['self-update', '--check', '--json'], {
      environment: { XDG_CONFIG_HOME: directory },
      fetch,
      stdout,
    })

    expect(JSON.parse(stdout.value)).toMatchObject({
      updated: false,
      current_version: '0.4.0',
      latest_version: '0.5.0',
      update_available: true,
      method: null,
      install_path: null,
    })
  })

  it('does not treat version shortcuts as self-update options', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
    await runCli(['self-update', '-V'], { fetch, autoUpdateCheck: false })
    await runCli(['self-update', '-v'], { fetch, autoUpdateCheck: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the v prefix when requesting a specific release', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(release('v0.3.1')))
    await checkForUpdates({
      environment: {
        TQX_UPDATE_RELEASES_URL: 'https://api.github.com/repos/tqx-ai/tqx-ts/releases',
      },
      process: runtime(),
      fetch,
      now: () => 1,
      version: '0.3.1',
      force: true,
    })
    expect(fetch.mock.calls[0]?.[0]).toContain('/tags/v0.3.1')
  })

  it('continues when the update state directory cannot be written', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([release('v0.4.0')]))
    const fileOps = {
      mkdir: vi.fn().mockRejectedValue(new Error('read-only')),
      writeFile: vi.fn().mockRejectedValue(new Error('read-only')),
      rename: vi.fn(),
      unlink: vi.fn(),
    }
    await expect(
      checkForUpdates({
        environment: { XDG_CONFIG_HOME: '/dev/null/nope' },
        process: runtime(),
        fetch,
        fileOps,
        now: () => 1,
        force: true,
      }),
    ).resolves.toMatchObject({ latest_version: '0.4.0' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not send GitHub credentials to a release mirror', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json([]))
    await expect(
      checkForUpdates({
        environment: {
          TQX_UPDATE_RELEASES_URL: 'https://mirror.example.test/releases',
          GH_TOKEN: 'secret-token',
        },
        process: runtime(),
        fetch,
        force: true,
      }),
    ).rejects.toThrow('No stable release')
    expect(fetch.mock.calls[0]?.[1]).not.toMatchObject({
      headers: expect.objectContaining({ Authorization: expect.any(String) }),
    })
  })

  it('restores cached release metadata without fabricating an empty release', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([release('v0.4.0')]))
    const deps = {
      environment: { XDG_CONFIG_HOME: directory },
      process: runtime(),
      fetch,
      now: () => 100,
    }
    await checkForUpdates(deps)
    const cached = await checkForUpdates({ ...deps, now: () => 101 })
    expect(cached.checked).toBe(false)
    expect(cached.latest_version).toBe('0.4.0')
    expect(cached.release?.assets).toEqual([])
  })

  it('selects the highest stable release and filters prereleases', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json([
          release('v0.4.1-beta.1', { prerelease: true }),
          release('v0.3.2'),
          release('v0.4.1'),
          release('v0.5.0', { draft: true }),
        ]),
      )

    const result = await checkForUpdates({
      environment: { XDG_CONFIG_HOME: directory },
      process: runtime(),
      fetch,
      now: () => 100,
    })

    expect(result.latest_version).toBe('0.4.1')
    expect(result.update_available).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/releases?per_page=100'),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
  })

  it('throttles automatic checks for 24 hours', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([release('v0.4.0')]))
    const deps = {
      environment: { XDG_CONFIG_HOME: directory },
      process: runtime(),
      fetch,
      now: () => 100,
    }

    await checkForUpdates(deps)
    await checkForUpdates({ ...deps, now: () => 100 + 24 * 60 * 60 * 1000 - 1 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throttles failed checks for 24 hours as well', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('offline'))
    const deps = {
      environment: { XDG_CONFIG_HOME: directory },
      process: runtime(),
      fetch,
      now: () => 100,
    }
    await expect(checkForUpdates(deps)).rejects.toThrow('Unable to check')
    const cached = await checkForUpdates({ ...deps, now: () => 101 })
    expect(cached.checked).toBe(false)
    expect(cached.update_available).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not execute a binary before checksum verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tqx-update-'))
    const target = join(directory, 'tqx')
    const binary = Buffer.from('untrusted')
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(binary))
      .mockResolvedValueOnce(new Response(`000000  tqx-v0.4.0-linux-x64\n`))
    const spawn = vi.fn()
    const check = {
      current_version: '0.3.1',
      latest_version: '0.4.0',
      update_available: true,
      release: release('v0.4.0', {
        assets: [
          { name: 'tqx-v0.4.0-linux-x64', browser_download_url: 'https://example.test/tqx' },
          { name: 'SHA256SUMS', browser_download_url: 'https://example.test/SHA256SUMS' },
        ],
      }),
      checked: true,
    }

    await expect(
      runUpdate(check, {
        process: runtime({ execPath: target, argv: ['tqx'] }),
        fetch,
        spawn,
      }),
    ).rejects.toThrow('SHA256 checksum mismatch')
    expect(spawn).not.toHaveBeenCalled()
    await expect(writeFile(target, binary)).resolves.toBeUndefined()
  })

  it('refuses package installation when the global bin path cannot be resolved', async () => {
    const spawn = vi.fn(() => {
      throw new Error('npm prefix failed')
    })
    const check = {
      current_version: '0.3.1',
      latest_version: '0.4.0',
      update_available: true,
      release: release('v0.4.0'),
      checked: true,
    }

    await expect(
      runUpdate(check, {
        process: runtime(),
        spawn,
      }),
    ).rejects.toThrow('refusing to install without being able to verify')
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['prefix', '-g'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    )
  })

  it('terminates a package manager that never exits', async () => {
    const install = hangingChild()
    const spawn = vi.fn((_command: string, args: readonly string[]) =>
      args[0] === 'prefix' ? completedChild('/usr/local\n') : install,
    ) as unknown as typeof nodeSpawn
    const check = {
      current_version: '0.3.1',
      latest_version: '0.4.0',
      update_available: true,
      release: release('v0.4.0'),
      checked: true,
    }

    await expect(
      runUpdate(check, { process: runtime(), spawn, processTimeoutMs: 20 }),
    ).rejects.toThrow('npm timed out')
    expect(install.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('skips automatic checks for help, version and self-update', () => {
    expect(shouldAutoCheck(['status'])).toBe(true)
    expect(shouldAutoCheck(['--help'])).toBe(false)
    expect(shouldAutoCheck(['--version'])).toBe(false)
    expect(shouldAutoCheck(['self-update'])).toBe(false)
  })
})
