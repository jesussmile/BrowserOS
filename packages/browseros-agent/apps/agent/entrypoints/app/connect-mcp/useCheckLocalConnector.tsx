import useSWRMutation from 'swr/mutation'
import { useAgentServerUrl } from '@/lib/browseros/useBrowserOSProviders'
import type { LocalConnectorCheckResult } from './AddLocalConnectorDialog'

interface CheckConnectorError {
  error: string
}

const checkLocalConnector = async (
  url: string,
  {
    arg,
  }: {
    arg: {
      url: string
    }
  },
): Promise<LocalConnectorCheckResult> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(arg),
  })

  if (!response.ok) {
    const errorData = (await response.json()) as CheckConnectorError
    throw new Error(errorData.error || 'Failed to check local connector')
  }

  return response.json() as Promise<LocalConnectorCheckResult>
}

export const useCheckLocalConnector = () => {
  const { baseUrl: agentServerUrl } = useAgentServerUrl()

  return useSWRMutation(
    agentServerUrl ? `${agentServerUrl}/local/apps/check-connector` : null,
    checkLocalConnector,
  )
}
