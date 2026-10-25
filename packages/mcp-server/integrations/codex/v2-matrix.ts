import type { TradingScope } from './target'
import { READ_TOOLS, WRITE_TOOLS } from './target'

export type V2Role = 'read' | 'write' | 'full'
export type FixtureScenario =
  | 'normal'
  | 'fail_at_2'
  | 'uncertain_at_2'
  | 'revoke_before_2'
  | 'expire_before_2'
  | 'quota_at_2'
  | 'unknown_first'
export interface V2Case {
  id: string
  role: V2Role
  tool: string
  input: string
  expectation: 'success' | 'denied' | 'invalid' | 'replay' | 'unknownReplay' | 'conflict' | 'batch'
  scenario: FixtureScenario
  writes: boolean
  maxLogicalItems?: number
  maxTransportAttemptsPerItem?: number
}
export const ROLE_SCOPES: Record<V2Role, TradingScope[]> = {
  read: ['trade:read'],
  write: ['order:write'],
  full: ['trade:read', 'order:write'],
}
export function v2Matrix(): V2Case[] {
  const cases: V2Case[] = READ_TOOLS.map((tool) => ({
    id: `read-${tool}`,
    role: 'read',
    tool,
    input: tool,
    expectation: 'success',
    scenario: 'normal',
    writes: false,
  }))
  for (const tool of WRITE_TOOLS) {
    cases.push({
      id: `read-denies-${tool}`,
      role: 'read',
      tool,
      input: tool,
      expectation: 'denied',
      scenario: 'normal',
      writes: false,
    })
    cases.push({
      id: `write-${tool}`,
      role: 'write',
      tool,
      input: tool,
      expectation: tool === 'placeOrders' ? 'batch' : 'success',
      scenario: 'normal',
      writes: true,
    })
    cases.push({
      id: `missing-key-${tool}`,
      role: 'full',
      tool,
      input: `missingKey.${tool}`,
      expectation: 'invalid',
      scenario: 'normal',
      writes: true,
      maxLogicalItems: 0,
    })
    if (tool !== 'placeOrders') {
      cases.push({
        id: `replay-${tool}`,
        role: 'full',
        tool,
        input: `replay.${tool}`,
        expectation: 'replay',
        scenario: 'normal',
        writes: true,
      })
      cases.push({
        id: `conflict-${tool}`,
        role: 'full',
        tool,
        input: `conflict.${tool}`,
        expectation: 'conflict',
        scenario: 'normal',
        writes: true,
      })
      cases.push({
        id: `unknown-replay-${tool}`,
        role: 'full',
        tool,
        input: `unknownReplay.${tool}`,
        expectation: 'unknownReplay',
        scenario: 'unknown_first',
        writes: true,
      })
    }
  }
  for (const tool of READ_TOOLS)
    cases.push({
      id: `write-denies-${tool}`,
      role: 'write',
      tool,
      input: tool,
      expectation: 'denied',
      scenario: 'normal',
      writes: false,
    })
  for (const name of ['empty', 'over20', 'duplicateKey', 'invalidLater'])
    cases.push({
      id: `batch-${name}`,
      role: 'full',
      tool: 'placeOrders',
      input: `batch.${name}`,
      expectation: 'invalid',
      scenario: 'normal',
      writes: true,
      maxLogicalItems: 0,
    })
  cases.push({
    id: 'batch-20',
    role: 'full',
    tool: 'placeOrders',
    input: 'batch.twenty',
    expectation: 'batch',
    scenario: 'normal',
    writes: true,
    maxLogicalItems: 20,
  })
  for (const scenario of [
    'fail_at_2',
    'uncertain_at_2',
    'revoke_before_2',
    'expire_before_2',
    'quota_at_2',
  ] as const)
    cases.push({
      id: `batch-${scenario}`,
      role: 'full',
      tool: 'placeOrders',
      input: `batch.${scenario}`,
      expectation: 'batch',
      scenario,
      writes: true,
      maxLogicalItems: 2,
    })
  for (const test of cases) test.maxTransportAttemptsPerItem = 3
  return cases
}
