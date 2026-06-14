import useSWR from 'swr'
import { useAgentServerUrl } from '@/lib/browseros/useBrowserOSProviders'

interface McpServerResponse {
  servers: {
    name: string
    description: string
    connectionMode?: 'local_catalog'
  }[]
  count: number
}

const getAllManagedServers = async ([hostUrl]: [hostUrl: string]) => {
  const response = await fetch(`${hostUrl}/local/apps/catalog`)
  const servers = (await response.json()) as McpServerResponse
  return servers
}

export const useGetMCPServersList = () => {
  const { baseUrl: agentServerUrl } = useAgentServerUrl()

  return useSWR(
    agentServerUrl ? [agentServerUrl, 'local/apps/catalog'] : null,
    getAllManagedServers,
    {
      keepPreviousData: true,
    },
  )
}
