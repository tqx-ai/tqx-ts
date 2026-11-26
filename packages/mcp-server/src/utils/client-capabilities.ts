import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/server'
import type { ClientCapabilities, ServerContext } from '@modelcontextprotocol/server'

// SDK 2.4 has no replacement getter for initialize-scoped legacy capabilities.
// Keep its supported legacy API behind a structural contract without the SDK's
// deprecation annotation; modern requests only use their own validated envelope.
interface LegacyCapabilitySource {
  getClientCapabilities(): ClientCapabilities | undefined
}

export function readClientCapabilities(
  legacy: LegacyCapabilitySource,
  context: ServerContext,
): ClientCapabilities | undefined {
  // SDK 2.4's generated declaration reduces RequestMetaEnvelope to {}.
  // Restore the documented field shape; the SDK validates it before dispatch.
  const envelope: { [CLIENT_CAPABILITIES_META_KEY]?: ClientCapabilities } | undefined =
    context.mcpReq.envelope
  return envelope === undefined
    ? legacy.getClientCapabilities()
    : envelope[CLIENT_CAPABILITIES_META_KEY]
}
