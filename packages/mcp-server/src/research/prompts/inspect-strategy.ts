import { requireScopes } from '@modelcontextprotocol/server'
import type { McpServer, PromptMessage } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import { promptSchema } from '../../utils/prompt-schema'
import type { ResearchError } from '../errors'
import {
  type LoadedStrategyResource,
  type StrategyAccessContext,
  createStrategyCompleters,
  isStrategyNotFoundOrForbidden,
  readStrategyResource,
  requireResearchReadAuth,
  strategyResourceUri,
} from '../resources/strategy'
import { extractObjectId } from '../resources/strategy-cache'

const inspectStrategyArgs = v.object({
  strategy: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(256),
    v.description('Strategy ID, completion suggestion ("Title [id]"), or fuzzy strategy name.'),
  ),
  version: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(256),
      v.description(
        'Optional frozen version ID, completion suggestion ("v3 - Name [id]"), or version number/name. Omit for the latest workspace version.',
      ),
    ),
  ),
})

function buildVerifiedStrategyMessages(loaded: LoadedStrategyResource): PromptMessage[] {
  const versionLabel =
    loaded.kind === 'version'
      ? `frozen version ${loaded.versionNumber !== undefined ? `v${loaded.versionNumber} (${loaded.versionId})` : loaded.versionId}`
      : 'the latest workspace version'

  return [
    {
      role: 'user',
      content: {
        type: 'resource',
        resource: {
          uri: loaded.uri,
          mimeType: 'application/json',
          text: loaded.text,
        },
      },
    },
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          `The requested Qube strategy (${loaded.strategyId}, ${versionLabel}) has been verified as accessible to the current user and loaded via MCP resource ${loaded.uri} above.`,
          'Present and analyze the strategy directly from this attached MCP resource (including its title, market, revision/version metadata, parameters, factor binding, and source code as appropriate).',
          'Do not call tqx_research_call with strategy.get or strategy.version.get to re-fetch this same strategy or version. Only use tqx_research_call if the user asks for additional data not included in the resource (such as backtests, other versions, or edits).',
          "Match the user's language in your response.",
        ].join('\n\n'),
      },
    },
  ]
}

function buildNotFoundMessages(
  strategyId: string,
  requestedVersion: string | undefined,
  error: ResearchError,
): PromptMessage[] {
  if (error.code === 'VERSION_NOT_FOUND' && requestedVersion) {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Server verification could not find version "${requestedVersion}" on Qube strategy ${strategyId} (the version does not exist, does not belong to this strategy, or is inaccessible).`,
            'Inform the user clearly instead of retrying the same invalid version.',
            `If helpful, offer to list available frozen versions via tqx_research_call with action "strategy.version.list" and input {"strategyId": "${strategyId}"}, or inspect the latest workspace version via MCP resource ${strategyResourceUri(strategyId)} (or strategy.get).`,
            "Match the user's language in your response.",
          ].join('\n\n'),
        },
      },
    ]
  }

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          `Server verification confirmed that Qube strategy ${strategyId} does not exist, has been deleted, or does not belong to the current authenticated account.`,
          'Do not blindly retry strategy.get with this invalid ID. Inform the user clearly, and offer to search their available strategies using tqx_research_call with action "strategy.list".',
          "Match the user's language in your response.",
        ].join('\n\n'),
      },
    },
  ]
}

function buildTransientFailureMessages(
  strategyId: string,
  requestedVersion: string | undefined,
): PromptMessage[] {
  const targetUri = requestedVersion
    ? `tqx://qube/strategies/${strategyId}/versions/${encodeURIComponent(requestedVersion)}`
    : strategyResourceUri(strategyId)

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          `Live verification for Qube strategy ${strategyId} was temporarily unavailable.`,
          `Try reading MCP resource ${targetUri} if the host supports reading MCP resources; otherwise call tqx_research_call with ${
            requestedVersion
              ? `action "strategy.version.list" ({"strategyId": "${strategyId}"}) and "strategy.version.get"`
              : `action "strategy.get" ({"strategyId": "${strategyId}", "includeSource": true})`
          }.`,
          'If the lookup still fails, report the error clearly without exposing private diagnostics.',
          "Match the user's language in your response.",
        ].join('\n\n'),
      },
    },
  ]
}

function buildFuzzySearchMessages(
  queryName: string,
  requestedVersion: string | undefined,
): PromptMessage[] {
  const versionStep = requestedVersion
    ? `Because the user also requested version "${requestedVersion}", inspect that specific frozen version using MCP resource tqx://qube/strategies/<strategyId>/versions/<versionId> (if the host supports reading MCP resources after resolving the versionId) or tqx_research_call with action "strategy.version.list" and "strategy.version.get".`
    : 'Read and present the latest workspace version of that strategy: prefer MCP resource tqx://qube/strategies/<strategyId> if the host supports reading MCP resources; otherwise call tqx_research_call with action "strategy.get" and input {"strategyId": "<strategyId>", "includeSource": true}.'

  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: [
          `The user provided a fuzzy strategy name (${JSON.stringify(queryName)}) rather than an exact 24-character strategy ID.`,
          `Call tqx_research_call with action "strategy.list" and input ${JSON.stringify({ keyword: queryName, limit: 20 })} to search the user's strategies.`,
          `If exactly one strategy matches: ${versionStep}`,
          'If multiple strategies match: list the matching candidates (title, market, id, updatedAt) and ask the user which strategy they want to inspect before reading source code.',
          'If no strategies match: inform the user clearly and offer to list their recent strategies via tqx_research_call with action "strategy.list".',
          "Match the user's language in your response.",
        ].join('\n\n'),
      },
    },
  ]
}

export function registerInspectStrategyPrompt(
  server: McpServer,
  context: StrategyAccessContext,
): void {
  const { completeStrategy, completeVersion } = createStrategyCompleters(context)

  server.registerPrompt(
    'inspect_strategy',
    {
      title: 'Inspect a Qube strategy',
      description:
        'Inspect a Qube strategy (latest workspace version by default, or an optional frozen version). Embeds the verified MCP strategy resource when an exact strategy ID is valid, or guides fuzzy lookup via tqx_research_call.',
      argsSchema: promptSchema(inspectStrategyArgs, {
        strategy: completeStrategy,
        version: completeVersion,
      }),
      scopeChallenge: requireScopes('research:read'),
    },
    async ({ strategy, version }) => {
      const auth = requireResearchReadAuth(context.auth)
      const requestedStrategy = strategy.trim()
      const requestedVersion = version?.trim() || undefined
      const strategyId = extractObjectId(requestedStrategy)

      if (!strategyId) {
        return {
          messages: buildFuzzySearchMessages(requestedStrategy, requestedVersion),
        }
      }

      try {
        const loaded = await readStrategyResource(
          context.gateway,
          auth,
          context.cache,
          strategyId,
          requestedVersion,
        )
        return {
          messages: buildVerifiedStrategyMessages(loaded),
        }
      } catch (error) {
        if (isStrategyNotFoundOrForbidden(error)) {
          return {
            messages: buildNotFoundMessages(strategyId, requestedVersion, error),
          }
        }
        return {
          messages: buildTransientFailureMessages(strategyId, requestedVersion),
        }
      }
    },
  )
}
