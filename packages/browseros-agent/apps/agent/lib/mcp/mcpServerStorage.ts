import { storage } from '@wxt-dev/storage'
import { useEffect, useState } from 'react'
import { isLiveMcpServer, type McpServer } from '@/lib/mcp/mcpServerTypes'

export { isLiveMcpServer, type McpServer }

export const mcpServerStorage = storage.defineItem<McpServer[]>(
  'local:mcpServers',
  {
    fallback: [],
  },
)

/**
 * @public
 */
export function useMcpServers() {
  const [servers, setServers] = useState<McpServer[]>([])

  useEffect(() => {
    mcpServerStorage.getValue().then(setServers)
    const unwatch = mcpServerStorage.watch((newValue) => {
      setServers(newValue ?? [])
    })
    return unwatch
  }, [])

  const addServer = async (server: McpServer) => {
    const current = (await mcpServerStorage.getValue()) ?? []
    await mcpServerStorage.setValue([...current, server])
  }

  const updateServer = async (
    id: string,
    updater: (server: McpServer) => McpServer,
  ) => {
    const current = (await mcpServerStorage.getValue()) ?? []
    await mcpServerStorage.setValue(
      current.map((server) => (server.id === id ? updater(server) : server)),
    )
  }

  const removeServer = async (id: string) => {
    const current = (await mcpServerStorage.getValue()) ?? []
    await mcpServerStorage.setValue(current.filter((s) => s.id !== id))
  }

  return { servers, addServer, updateServer, removeServer }
}
