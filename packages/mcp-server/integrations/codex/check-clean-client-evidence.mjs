import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const required = {
  C0: ['clientProvenance', 'surface', 'clientVersion', 'target', 'issuer'],
  C1: ['source', 'plugin', 'version', 'server', 'configurationEvidence'],
  C2: ['ownConsentEvidence', 'nativeCompletionEvidence'],
  C3: ['session', 'selectedPlugin', 'schemaEvidence'],
  C4: [
    'accountEvidence',
    'positionsEvidence',
    'ordersArguments',
    'ordersEvidence',
    'filterProofScope',
  ],
  C5: ['newSession', 'sameAuthEvidence', 'schemaEvidence', 'accountEvidence'],
}

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0

export function checkEvidence(input = {}) {
  const missing = []
  for (const [stage, fields] of Object.entries(required)) {
    const evidence = input?.stages?.[stage]
    if (evidence?.status !== 'passed') missing.push(`${stage}.status=passed`)
    for (const field of fields) {
      if (!nonempty(evidence?.[field])) missing.push(`${stage}.${field}`)
    }
  }
  if (!['desktop', 'cli'].includes(input?.stages?.C0?.surface))
    missing.push('C0.surface=desktop|cli')
  if (input?.stages?.C3?.session && input.stages.C3.session === input?.stages?.C5?.newSession) {
    missing.push('C5.newSession must differ from C3.session')
  }
  return {
    schemaVersion: 1,
    structuralCompleteness: missing.length ? 'incomplete' : 'complete-needs-human-review',
    externalAcceptance: 'not-verified-by-this-script',
    missing,
    actualToolCalls: 0,
    note: 'Checks supplied evidence references only; does not authenticate, open references, verify truth, or execute any command/network request. Placeholders are not evidence.',
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || args[0]?.startsWith('-')) {
    console.error('Usage: node check-clean-client-evidence.mjs [PUBLIC_EVIDENCE.json]')
    process.exitCode = 1
    return
  }
  const input = args[0] ? JSON.parse(await readFile(args[0], 'utf8')) : {}
  const result = checkEvidence(input)
  console.log(JSON.stringify(result, null, 2))
  if (result.missing.length) process.exitCode = 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => {
    console.error(
      'Could not read public evidence JSON; no commands, network or authentication were executed.',
    )
    process.exitCode = 1
  })
}
