import { fileURLToPath } from 'node:url'
import { SkillCatalog } from '@modelcontextprotocol/server/ext/skills'
import type { SkillFiles, SkillWarning } from '@modelcontextprotocol/server/ext/skills'
import { nodeSkillFiles } from '@modelcontextprotocol/server/ext/skills/node'

import { getLogger } from './utils/logger'

const SKILLS_CACHE_TTL_MS = 5 * 60 * 1000
const skillsLog = getLogger('skills')

export const PLUGIN_SKILLS_DIRECTORY = fileURLToPath(
  new URL('../../../plugins/agent-plugin/skills', import.meta.url),
)

function isIgnoredSkillEntry(name: string): boolean {
  return (
    name.startsWith('.') ||
    ['__pycache__', 'node_modules', 'Thumbs.db', 'desktop.ini', '__MACOSX'].includes(name) ||
    /\.py[co]$/.test(name)
  )
}

function hasIgnoredSegment(relativePath: string): boolean {
  return relativePath.split('/').filter(Boolean).some(isIgnoredSkillEntry)
}

export function createFilteredSkillFiles(base: SkillFiles): SkillFiles {
  return {
    async list(dir) {
      if (hasIgnoredSegment(dir)) throw new Error(`No such skill directory: ${dir}`)
      const entries = await base.list(dir)
      return entries.filter((entry) => !isIgnoredSkillEntry(entry.name))
    },
    async read(path) {
      if (hasIgnoredSegment(path)) throw new Error(`No such skill file: ${path}`)
      return base.read(path)
    },
  }
}

export async function loadPluginSkills(directory = PLUGIN_SKILLS_DIRECTORY): Promise<SkillCatalog> {
  const catalog = await SkillCatalog.load(createFilteredSkillFiles(nodeSkillFiles(directory)), {
    strict: true,
    cacheHint: { ttlMs: SKILLS_CACHE_TTL_MS, cacheScope: 'public' },
    onWarning: (warning: SkillWarning) => {
      skillsLog.warn({ event: 'mcp.skill_warning', path: warning.path, message: warning.message })
    },
  })
  if (catalog.entries.length === 0) {
    throw new Error(`No packaged skills found in ${directory}`)
  }
  return catalog
}

let defaultCatalog: Promise<SkillCatalog> | undefined

export function getDefaultPluginSkills(): Promise<SkillCatalog> {
  defaultCatalog ??= loadPluginSkills().catch((error: unknown) => {
    defaultCatalog = undefined
    throw error
  })
  return defaultCatalog
}
