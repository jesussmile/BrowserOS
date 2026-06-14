import { describe, expect, it, mock } from 'bun:test'
import type { UIMessage } from 'ai'
import type { Conversation } from './conversationStorage'

let storedConversations: Conversation[] = []

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: (_key: string, options?: { fallback?: Conversation[] }) => ({
      getValue: async () => storedConversations ?? options?.fallback,
      setValue: async (value: Conversation[]) => {
        storedConversations = value
      },
      watch: () => () => undefined,
    }),
  },
}))

mock.module('../execution-history/storage', () => ({
  removeConversationExecutionHistory: async () => undefined,
}))

mock.module('./localSessionClient', () => ({
  deleteLocalServerConversation: async () => false,
  getLocalServerConversation: async () => null,
  listLocalServerConversations: async () => null,
  saveLocalServerConversation: async () => null,
}))

const loadStorage = async () => await import('./conversationStorage')

describe('conversationStorage', () => {
  it('recognizes UUID conversation ids', async () => {
    const { isValidConversationId } = await loadStorage()

    expect(isValidConversationId('00000000-0000-4000-8000-000000000001')).toBe(
      true,
    )
    expect(isValidConversationId('live-local-ui-restore-123')).toBe(false)
  })

  it('does not restore non-UUID cached conversations as active chat ids', async () => {
    const { getConversationById, getLatestConversation } = await loadStorage()
    const validConversationId = '00000000-0000-4000-8000-000000000001'

    storedConversations = [
      conversation('live-local-ui-restore-123', 20),
      conversation(validConversationId, 10),
    ]

    expect(
      await getConversationById('live-local-ui-restore-123'),
    ).toBeUndefined()
    expect(await getLatestConversation()).toMatchObject({
      id: validConversationId,
    })
  })

  it('sanitizes oversized tool outputs before caching conversations', async () => {
    const { saveConversation } = await loadStorage()
    const validConversationId = '00000000-0000-4000-8000-000000000002'

    await saveConversation(validConversationId, [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-filesystem_bash',
            toolCallId: 'tool-1',
            state: 'output-available',
            input: { command: 'dir' },
            output: {
              content: [{ type: 'text', text: 'x'.repeat(200_000) }],
            },
          } as unknown as UIMessage['parts'][number],
        ],
      } as UIMessage,
    ])

    expect(JSON.stringify(storedConversations)).not.toContain('x'.repeat(1_000))
    expect(JSON.stringify(storedConversations)).toContain('_pannamosOmitted')
  })
})

function conversation(id: string, lastMessagedAt: number): Conversation {
  return {
    id,
    lastMessagedAt,
    messages: [
      {
        id: `${id}:message`,
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      } as UIMessage,
    ],
  }
}
