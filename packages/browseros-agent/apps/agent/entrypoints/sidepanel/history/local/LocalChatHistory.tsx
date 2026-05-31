import type { FC } from 'react'
import { useMemo } from 'react'
import { useConversations } from '@/lib/conversations/conversationStorage'
import { useChatSessionContext } from '../../layout/ChatSessionContext'
import { ConversationList } from '../components/ConversationList'
import type { HistoryConversation } from '../components/types'
import { extractLastUserMessage, groupConversations } from '../components/utils'

interface LocalChatHistoryProps {
  conversationPath?: string
  newConversationPath?: string
}

export const LocalChatHistory: FC<LocalChatHistoryProps> = ({
  conversationPath,
  newConversationPath,
}) => {
  const { conversations: localConversations, removeConversation } =
    useConversations()
  const { conversationId: activeConversationId } = useChatSessionContext()

  const conversations = useMemo<HistoryConversation[]>(() => {
    return localConversations.map((conv) => ({
      id: conv.id,
      lastMessagedAt: conv.lastMessagedAt,
      lastUserMessage: extractLastUserMessage(conv.messages),
    }))
  }, [localConversations])

  const groupedConversations = useMemo(
    () => groupConversations(conversations),
    [conversations],
  )

  return (
    <ConversationList
      groupedConversations={groupedConversations}
      activeConversationId={activeConversationId}
      onDelete={removeConversation}
      conversationPath={conversationPath}
      newConversationPath={newConversationPath}
    />
  )
}
