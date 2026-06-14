import type { UIMessage } from 'ai'
import { useCallback, useRef } from 'react'

export function useRemoteConversationSave() {
  const createdConversationsRef = useRef<Set<string>>(new Set())
  const savedMessageIdsRef = useRef<Set<string>>(new Set())

  const saveConversation = async (
    _conversationId: string,
    _messages: UIMessage[],
  ) => {
    // Private local-first build: remote BrowserOS conversation sync is disabled.
    // Conversations are saved through local SQLite via conversationStorage.
  }

  const resetConversation = () => {
    savedMessageIdsRef.current = new Set()
  }

  const markMessagesAsSaved = useCallback(
    (conversationId: string, messages: UIMessage[]) => {
      createdConversationsRef.current.add(conversationId)
      for (const msg of messages) {
        savedMessageIdsRef.current.add(msg.id)
      }
    },
    [],
  )

  return {
    isLoggedIn: false,
    saveConversation,
    resetConversation,
    markMessagesAsSaved,
  }
}
