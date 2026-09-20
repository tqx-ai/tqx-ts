import { networkInterfaces } from 'node:os'

const MAC_PATTERN = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/

/** Returns one deterministic, non-loopback MAC from the CLI runtime. */
export function getLocalMacAddress(): string | undefined {
  try {
    const addresses = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => !entry.internal)
      .map((entry) => entry.mac.trim().toLowerCase().replaceAll('-', ':'))
      .filter((mac) => MAC_PATTERN.test(mac) && mac !== '00:00:00:00:00:00')

    return [...new Set(addresses)].toSorted()[0]
  } catch {
    return undefined
  }
}
