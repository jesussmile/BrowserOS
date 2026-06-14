import type { FC } from 'react'
import { LocalChatHistory } from './local/LocalChatHistory'

interface ChatHistoryRouteProps {
  conversationPath?: string
  newConversationPath?: string
}

export const ChatHistory: FC<ChatHistoryRouteProps> = ({
  conversationPath,
  newConversationPath,
}) => {
  return (
    <LocalChatHistory
      conversationPath={conversationPath}
      newConversationPath={newConversationPath}
    />
  )
}
