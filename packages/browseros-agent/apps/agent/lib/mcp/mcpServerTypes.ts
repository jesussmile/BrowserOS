import { isLoopbackHttpUrl } from '@browseros/shared/utils/local-url'

/**
 * @public
 */
export interface McpToolPreview {
  name: string
  description?: string
}

export interface McpServer {
  id: string
  displayName: string
  type: 'managed' | 'custom'
  managedServerName?: string
  managedServerDescription?: string
  connectionMode?: 'local_catalog'
  config?: {
    url?: string
    description?: string
    tools?: McpToolPreview[]
    toolCount?: number
    lastCheckedAt?: number
    lastCheckStatus?: 'ok' | 'error'
    lastCheckError?: string
  }
}

export function isLiveMcpServer(
  server: McpServer,
): server is McpServer & { config: { url: string } } {
  return Boolean(server.config?.url && isLoopbackHttpUrl(server.config.url))
}
