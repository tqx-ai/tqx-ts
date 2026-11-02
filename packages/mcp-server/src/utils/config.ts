export function configurationError(name: string): Error {
  // Configuration values can contain accidentally pasted credentials; never echo them.
  return new Error(`[mcp-config] Invalid or missing ${name}`)
}

export function parsePublicUrl(value: string, name: string, production: boolean): URL {
  try {
    const url = new URL(value)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !production)) ||
      url.username ||
      url.password ||
      value.includes('?') ||
      value.includes('#')
    ) {
      throw configurationError(name)
    }
    return url
  } catch {
    throw configurationError(name)
  }
}

export function parseList(value: string, name: string, allowEmpty = false): string[] {
  if (!value && allowEmpty) return []
  const entries = value.split(',').map((entry) => entry.trim())
  if (entries.some((entry) => !entry)) throw configurationError(name)
  return [...new Set(entries)]
}
