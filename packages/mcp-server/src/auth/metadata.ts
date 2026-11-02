import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'

import type { McpConfig } from '../config'
import { SUPPORTED_SCOPES } from './scopes'

export function createResourceMetadata(config: McpConfig) {
  return {
    url: new URL(getOAuthProtectedResourceMetadataUrl(new URL(config.resourceUrl))),
    document: {
      resource: config.resourceUrl,
      authorization_servers: [config.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [...SUPPORTED_SCOPES],
      resource_name: 'TQX MCP Server',
    },
  }
}
