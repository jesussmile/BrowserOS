import type { Conversation } from './conversationStorage'

export async function uploadConversationsToGraphql(
  conversations: Conversation[],
) {
  void conversations
  // Private local-first build: conversations are persisted locally through
  // SQLite and extension storage, never uploaded to upstream GraphQL.
}
