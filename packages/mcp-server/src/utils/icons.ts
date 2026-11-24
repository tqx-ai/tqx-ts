import { readFileSync } from 'node:fs'
import type { Icon } from '@modelcontextprotocol/server'

function icon(name: string): Icon[] {
  const data = readFileSync(new URL(`../assets/icons/${name}.png`, import.meta.url))
  return [
    {
      src: `data:image/png;base64,${data.toString('base64')}`,
      mimeType: 'image/png',
      sizes: ['48x48'],
    },
  ]
}

// Load once per process. Each icon includes its own background for either client theme.
export const serverIcons = icon('tqx')

export const toolIcons = {
  tqx_ping: icon('ping'),
  tqx_research_explore: icon('research-explore'),
  tqx_research_call: icon('research-call'),
  tqx_trading_snapshot: icon('snapshot'),
  tqx_trading_activity: icon('activity'),
  tqx_trading_lookup: icon('lookup'),
  tqx_trading_order: icon('order'),
  tqx_trading_control: icon('control'),
  tqx_submit_bug_report: icon('bug-report'),
} satisfies Record<string, Icon[]>

export const promptIcons = {
  inspect_strategy: toolIcons.tqx_research_explore,
  prepare_bug_report: toolIcons.tqx_submit_bug_report,
} satisfies Record<string, Icon[]>

export const resourceIcons = {
  qube_strategy: toolIcons.tqx_research_explore,
  qube_strategy_version: toolIcons.tqx_research_explore,
} satisfies Record<string, Icon[]>
