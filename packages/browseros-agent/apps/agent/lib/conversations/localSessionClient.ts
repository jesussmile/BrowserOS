import type { UIMessage } from 'ai'
import { getAgentServerUrl } from '@/lib/browseros/helpers'
import type { Conversation } from './conversationStorage'

const REQUEST_TIMEOUT_MS = 2000

interface LocalSessionResponse {
  session: {
    id: string
    messages: UIMessage[]
    lastMessagedAt: number
  }
}

interface LocalSessionsResponse {
  sessions: {
    id: string
    messages: UIMessage[]
    lastMessagedAt: number
  }[]
}

async function requestLocal<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const baseUrl = await getAgentServerUrl()
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function toConversation(
  session: LocalSessionResponse['session'],
): Conversation {
  return {
    id: session.id,
    messages: session.messages,
    lastMessagedAt: session.lastMessagedAt,
  }
}

export async function listLocalServerConversations(): Promise<
  Conversation[] | null
> {
  const response = await requestLocal<LocalSessionsResponse>('/local/sessions')
  return response?.sessions.map(toConversation) ?? null
}

export async function getLocalServerConversation(
  id: string,
): Promise<Conversation | null> {
  const response = await requestLocal<LocalSessionResponse>(
    `/local/sessions/${encodeURIComponent(id)}`,
  )
  return response?.session ? toConversation(response.session) : null
}

export async function saveLocalServerConversation(
  conversation: Conversation,
): Promise<Conversation | null> {
  const response = await requestLocal<LocalSessionResponse>('/local/sessions', {
    method: 'POST',
    body: JSON.stringify(conversation),
  })
  return response?.session ? toConversation(response.session) : null
}

export async function deleteLocalServerConversation(
  id: string,
): Promise<boolean> {
  const response = await requestLocal<{ success: boolean }>(
    `/local/sessions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  return response?.success ?? false
}

export async function compactLocalServerConversation(id: string): Promise<{
  summary: string
  messageCount: number
  retainedRecentCount: number
  compactedAt: number
} | null> {
  const response = await requestLocal<{
    compaction: {
      summary: string
      messageCount: number
      retainedRecentCount: number
      compactedAt: number
    }
  }>(`/local/sessions/${encodeURIComponent(id)}/compact`, {
    method: 'POST',
  })
  return response?.compaction ?? null
}
