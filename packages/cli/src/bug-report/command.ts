import { defineCommand } from 'citty'
import { randomUUID } from 'node:crypto'

import type { CommandRuntime } from '../runtime/command-runtime'
import { CliUsageError } from '../utils/errors'

export function createBugCommand(runtime: CommandRuntime) {
  return defineCommand({
    meta: { name: 'bug', description: 'Report a bug' },
    subCommands: {
      report: defineCommand({
        meta: { name: 'report', description: 'Submit a detailed bug report' },
        args: {
          title: { type: 'string', required: true, description: 'Short bug title' },
          desc: { type: 'string', required: true, description: 'Detailed incident description' },
        },
        run: ({ args }) =>
          runtime.user((client) => {
            if (!args.title?.trim()) throw new CliUsageError('--title must not be empty')
            if (!args.desc?.trim()) throw new CliUsageError('--desc must not be empty')
            return client.bugs.report({
              title: args.title,
              description: args.desc,
              idempotencyKey: `cli-bug-${randomUUID()}`,
            })
          }),
      }),
    },
  })
}
