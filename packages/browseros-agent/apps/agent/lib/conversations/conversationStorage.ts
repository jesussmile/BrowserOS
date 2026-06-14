import { storage } from '@wxt-dev/storage'
import type { UIMessage } from 'ai'
import { useEffect, useState } from 'react'
import { removeConversationExecutionHistory } from '../execution-history/storage'
import {
  deleteLocalServerConversation,
  getLocalServerConversation,
  listLocalServerConversations,
  saveLocalServerConversation,
} from './localSessionClient'
import { sanitizeConversationMessages } from './messageSanitization'

const MAX_CONVERSATIONS = 50

export interface Conversation {
  id: string
  messages: UIMessage[]
  lastMessagedAt: number
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidConversationId(id: string): boolean {
  return UUID_PATTERN.test(id)
}

export const conversationStorage = storage.defineItem<Conversation[]>(
  'local:conversations',
  {
    fallback: [],
  },
)

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => b.lastMessagedAt - a.lastMessagedAt)
}

function limitConversations(conversations: Conversation[]): Conversation[] {
  return sortConversations(conversations).slice(0, MAX_CONVERSATIONS)
}

function sanitizeConversation(conversation: Conversation): Conversation {
  const messages = sanitizeConversationMessages(conversation.messages)
  return messages === conversation.messages
    ? conversation
    : { ...conversation, messages }
}

function mergeConversations(conversations: Conversation[]): Conversation[] {
  const byId = new Map<string, Conversation>()
  for (const rawConversation of conversations) {
    const conversation = sanitizeConversation(rawConversation)
    const current = byId.get(conversation.id)
    if (
      !current ||
      conversation.lastMessagedAt >= current.lastMessagedAt ||
      conversation.messages.length > current.messages.length
    ) {
      byId.set(conversation.id, conversation)
    }
  }
  return limitConversations([...byId.values()])
}

async function updateConversationCache(
  updater: (current: Conversation[]) => Conversation[],
): Promise<Conversation[]> {
  const current = (await conversationStorage.getValue()) ?? []
  const next = limitConversations(updater(current))
  await conversationStorage.setValue(next)
  return next
}

export async function loadConversations(): Promise<Conversation[]> {
  const cachedConversations = limitConversations(
    ((await conversationStorage.getValue()) ?? []).map(sanitizeConversation),
  )
  const serverConversations = await listLocalServerConversations()
  if (serverConversations) {
    const serverIds = new Set(serverConversations.map((session) => session.id))
    const conversationsToMigrate = cachedConversations.filter(
      (conversation) =>
        conversation.messages.length > 0 && !serverIds.has(conversation.id),
    )
    const migratedConversations = (
      await Promise.all(conversationsToMigrate.map(saveLocalServerConversation))
    ).filter((conversation): conversation is Conversation => !!conversation)

    const limited = mergeConversations([
      ...serverConversations,
      ...migratedConversations,
    ])
    await conversationStorage.setValue(limited)
    return limited
  }
  return cachedConversations
}

export async function getConversationById(
  id: string,
): Promise<Conversation | undefined> {
  if (!isValidConversationId(id)) return undefined

  const serverConversation = await getLocalServerConversation(id)
  if (serverConversation) {
    const sanitizedServerConversation = sanitizeConversation(serverConversation)
    await updateConversationCache((current) => {
      const withoutExisting = current.filter((c) => c.id !== id)
      return [sanitizedServerConversation, ...withoutExisting]
    })
    return sanitizedServerConversation
  }

  const current = (await conversationStorage.getValue()) ?? []
  const conversation = current.find((c) => c.id === id)
  return conversation ? sanitizeConversation(conversation) : undefined
}

export async function getLatestConversation(): Promise<
  Conversation | undefined
> {
  const conversations = await loadConversations()
  return conversations.find(
    (conversation) =>
      conversation.messages.length > 0 &&
      isValidConversationId(conversation.id),
  )
}

export async function saveConversation(
  id: string,
  messages: UIMessage[],
): Promise<void> {
  const sanitizedMessages = sanitizeConversationMessages(messages)
  const current = (await conversationStorage.getValue()) ?? []
  const existing = current.find((c) => c.id === id)

  if (
    existing &&
    existing.messages.length === sanitizedMessages.length &&
    JSON.stringify(existing.messages) === JSON.stringify(sanitizedMessages)
  ) {
    return
  }

  const conversation: Conversation = {
    id,
    messages: sanitizedMessages,
    lastMessagedAt: Date.now(),
  }

  const next = await updateConversationCache((current) => [
    conversation,
    ...current.filter((c) => c.id !== id),
  ])

  const removedConversations = sortConversations([
    conversation,
    ...current.filter((c) => c.id !== id),
  ]).slice(MAX_CONVERSATIONS)
  await Promise.all(
    removedConversations.map((removed) =>
      removeConversationExecutionHistory(removed.id),
    ),
  )

  const saved = await saveLocalServerConversation(conversation)
  if (saved) {
    await updateConversationCache((current) => [
      saved,
      ...current.filter((c) => c.id !== saved.id),
    ])
  } else {
    await conversationStorage.setValue(next)
  }
}

export async function removeConversation(id: string): Promise<void> {
  await updateConversationCache((current) => current.filter((c) => c.id !== id))
  await deleteLocalServerConversation(id)
  await removeConversationExecutionHistory(id)
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    loadConversations().then(setConversations)
    const unwatch = conversationStorage.watch((newValue) => {
      setConversations(limitConversations(newValue ?? []))
    })
    return unwatch
  }, [])

  const getConversation = (id: string) => {
    return conversations.find((c) => c.id === id)
  }

  return {
    conversations,
    removeConversation,
    saveConversation,
    getConversation,
  }
}
