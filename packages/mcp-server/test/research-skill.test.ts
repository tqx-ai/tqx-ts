import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { actions } from '../src/research/tools/actions'

const root = resolve(import.meta.dirname, '../../..')
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
const research = resolve(root, 'skills/tqx-research')
const plugin = resolve(root, 'plugins/agent-plugin')

describe('Research Skill contracts', () => {
  it.each([research, resolve(plugin, 'skills/tqx-research')])(
    'ships resolvable references inside the distribution at %s',
    (skill) => {
      const boundary = skill === research ? resolve(root, 'skills') : plugin
      for (const file of files(skill).filter(
        (path) => path.endsWith('.md') && !path.endsWith('/install.md'),
      )) {
        const text = readFileSync(file, 'utf8')
        for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
          const link = match[1]!.split('#')[0]!
          if (!link || /^[a-z]+:\/\//i.test(link)) continue
          const target = resolve(dirname(file), link)
          expect(relative(boundary, target).startsWith('..'), `${file}: ${link}`).toBe(false)
          expect(existsSync(target), `${file}: ${link}`).toBe(true)
        }
      }
    },
  )

  it('documents available MCP action families and valid public request examples', () => {
    const text = readFileSync(resolve(plugin, 'skills/tqx-research/references/mcp.md'), 'utf8')
    const documented = new Set<string>()
    for (const row of text.split('\n').filter((line) => line.startsWith('| `'))) {
      const cells = row.split('|')
      const families = [...cells[1]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!)
      const operations = [...cells[2]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!)
      for (const family of families)
        for (const operation of operations) documented.add(`${family}.${operation}`)
    }
    expect([...documented].toSorted()).toEqual([...actions.keys()].toSorted())
    for (const match of text.matchAll(/```json\n([\s\S]*?)\n```/g)) {
      const example = JSON.parse(match[1]!)
      const action = actions.get(example.action)
      expect(action, example.action).toBeDefined()
      expect(v.safeParse(action!.input, example.input).success, example.action).toBe(true)
    }
  })

  it.each([research, resolve(plugin, 'skills/tqx-research')])(
    'keeps the research Skill in English without executable scripts at %s',
    (skill) => {
      const resources = files(skill)
      expect(resources.filter((path) => /\.(py|sh|ps1)$/.test(path))).toEqual([])
      for (const file of resources.filter((path) => /\.(md|yaml|yml|json)$/.test(path))) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(/[\u3400-\u9fff]/u)
      }
    },
  )
})
