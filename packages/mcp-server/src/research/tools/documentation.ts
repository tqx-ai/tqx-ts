import { toolSchema } from '../../utils/tool-schema'
import type { Action } from './actions'

const reference =
  'https://github.com/tqx-ai/tqx-ts/blob/main/plugins/agent-plugin/skills/tqx-research/references/'

export function describeAction(action: Action) {
  const factor = action.name.startsWith('factor.')
  const kind = factor ? 'factor' : 'strategy'
  const child = factor ? 'analysis' : 'backtest'
  const key = factor ? 'factorId' : 'strategyId'
  const runKey = factor ? 'analysisId' : 'runId'
  const result = factor ? 'factor.analysis.result.get' : 'backtest.result.get'
  const call = {
    action: action.name,
    input: action.exampleInput,
    ...(action.name.endsWith('.delete') ? { confirm: true } : {}),
  }
  return {
    action: action.name,
    description: action.description,
    inputSchema: toolSchema(action.input)['~standard'].jsonSchema.input({
      target: 'draft-2020-12',
    }),
    outputSchema: toolSchema(action.output)['~standard'].jsonSchema.output({
      target: 'draft-2020-12',
    }),
    documentation: `# ${action.name}

${action.description}

Required scope: \`${action.scope}\`. Research actions do not require a trading Agent binding. Always pass exact lowercase 24-character ObjectIds returned by upstream; never infer IDs from titles. Unknown input fields are rejected. See inputSchema for required fields, enums, and bounds; outputSchema describes the direct business object returned on success.

## Usage and Constraints

${action.notes}

Synchronous actions return results directly; factor.analysis.submit, strategy.backtest.submit, and factor/strategy.tuning.submit/rerun start asynchronous jobs. Missing scopes trigger an MCP OAuth scope challenge. INVALID_INPUT indicates invalid parameters; on SOURCE_CONFLICT or CONFIG_CONFLICT, re-read the current revisions; on RUN_NOT_READY, check run status first. Backtest result and chart reads may return empty or partial data while preserving partial, availableFrom, availableTotal, and benchmark; on LIVE_RESULT_UNAVAILABLE, back off and retry reading the same runId rather than resubmitting. A network timeout or response validation error does not prove that a remote write failed -- never auto-retry with a new requestId. If a response is too large, narrow pagination or the date range.

## Request and Response Examples

The JSON below shows parameters for tqx_research_call; IDs and values are illustrative. Source strings are placeholders -- replace them with task-specific source and validate before writing.

\`\`\`json
${JSON.stringify(call, null, 2)}
\`\`\`

On success, structuredContent contains the business object directly and content carries its matching JSON text, with no extra data wrapper. Optional fields may be omitted below; see outputSchema for the full shape.

\`\`\`json
${JSON.stringify(action.exampleOutput, null, 2)}
\`\`\`

## Composing with Other Actions

1. Call ${kind}.list to pick a resource and use items[].id as ${key}; call ${kind}.get to read sourceRevision and configRevision.
2. For an ordinary run, save user-specified settings first with ${kind}.update; verify parameters, parameterValidation.status=valid, aligned revisions, and no parametersDraft. Unspecified fields inherit saved settings or market defaults. Call ${kind}.validate with the resource ID and sourceRevision; if valid=false, fix source diagnostics and validate again.
3. Call ${kind}.${child}.submit with ${key}, requestId, and the saved expectedSourceRevision and expectedConfigRevision, omitting ${factor ? 'parameters' : 'backtest'}. Only pass a one-off override when the user explicitly requests a temporary trial run; overrides do not persist. Keep the response root id as ${runKey} and verify the recorded run parameter snapshot.
4. Poll ${kind}.${child}.get about every 2 seconds until status reaches succeeded, failed, or cancelled. Keep the ID on timeout and back off on rate limits. Stop dependent steps on failure or cancellation.
5. ${factor ? 'After succeeded, read factor results' : 'Read available empty or partial backtest outputs while running and final outputs after succeeded'} via ${result} pagination (use nextOffset when hasMore=true). Save a frozen version using the resource ID, a succeeded run ID, and a distinct requestId.
${factor ? '' : '6. When the user-requested strategy backtest reaches status=succeeded (including an already-terminal submission), automatically call tqx_backtest_view({type:"qube",runId:<submission id>}) unless the user requested text only. Do not ask the user for the ID or another request to show the report. If the host cannot render Apps, use its text summary. A failed report read must retry the same run, never resubmit a backtest. Failed/cancelled runs must not be described as completed successfully.'}

Parameter tuning: ${kind}.tuning.submit returns a root id used as tuningId; poll get until succeeded, failed, cancelled, or no_valid_candidates (cancelling is not terminal). Read ${factor ? 'trialId' : 'id (as candidateId)'} from candidates, and pass the resource current revisions to apply. list returns at most 200 summaries; use search for full history. rerun requires a new requestId and returns a new root id as tuningId.

Factor-to-strategy workflow: call factor.version.search for the strategy market to find bindable versions; pass resourceId as factorId and id as factorVersionId in strategy.create or strategy.update factorBinding. Bindings must match the strategy market; pass null to unbind. End-to-end flow: factor.create -> factor.validate -> factor.analysis.submit/get -> factor.version.create -> strategy.create -> strategy.backtest.submit/get, stopping dependent steps if any stage fails.

Related actions: ${action.related.map((name) => `\`${name}\``).join(', ')}. Inspect exact contracts with tqx_research_explore({action}); exploring first is optional before calling.

## Related Documentation

- [Research MCP interface and action contracts](${reference}mcp.md)
- [Research workflow, states, and tuning guide](${reference}workflow.md)
- [${factor ? 'Factor authoring guide' : 'Strategy source quality and server validation'}](${reference}${factor ? 'factor-creation.md' : 'strategy-quality.md'})

Markets are limited to hk and us. This tool executes Qube Research MCP action contracts only; it does not provide tqx_data, standalone market data, fundamentals, symbol K-lines, or trading account operations.
`,
  }
}
