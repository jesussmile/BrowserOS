import { describe, expect, it } from 'bun:test'
import type { UIMessage } from 'ai'
import { sanitizeConversationMessages } from './messageSanitization'

function asPart(part: Record<string, unknown>): UIMessage['parts'][number] {
  return part as unknown as UIMessage['parts'][number]
}

describe('sanitizeConversationMessages', () => {
  it('omits non-nudge tool output from sidepanel history', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          asPart({
            type: 'tool-filesystem_bash',
            toolCallId: 'tool-1',
            state: 'output-available',
            input: { command: 'dir' },
            output: {
              content: [{ type: 'text', text: 'x'.repeat(200_000) }],
              isError: false,
            },
          }),
        ],
      } as UIMessage,
    ]

    const sanitized = sanitizeConversationMessages(messages)
    const toolPart = sanitized[0]?.parts[0] as {
      output?: { _pannamosOmitted?: boolean; content?: { text?: string }[] }
    }

    expect(sanitized).not.toBe(messages)
    expect(toolPart.output?._pannamosOmitted).toBe(true)
    expect(JSON.stringify(sanitized).length).toBeLessThan(2_000)
  })

  it('keeps only recent messages for restored UI state', () => {
    const messages = Array.from(
      { length: 70 },
      (_, index) =>
        ({
          id: `message-${index}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
          parts: [{ type: 'text', text: `message ${index}` }],
        }) as UIMessage,
    )

    const sanitized = sanitizeConversationMessages(messages)

    expect(sanitized).toHaveLength(60)
    expect(sanitized[0]?.id).toBe('message-10')
  })

  it('truncates oversized text parts', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'a'.repeat(70_000) }],
      } as UIMessage,
    ]

    const sanitized = sanitizeConversationMessages(messages)
    const textPart = sanitized[0]?.parts[0] as { text?: string }

    expect(textPart.text?.length).toBeLessThan(70_000)
    expect(textPart.text).toContain('[truncated')
  })

  it('removes provider metadata with encrypted reasoning blobs', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        providerMetadata: {
          openai: {
            reasoningEncryptedContent: 'm'.repeat(500_000),
          },
        },
        parts: [
          asPart({
            type: 'reasoning',
            text: 'thinking',
            providerMetadata: {
              openai: {
                reasoningEncryptedContent: 'r'.repeat(500_000),
              },
            },
          }),
          asPart({
            type: 'text',
            text: 'done',
            providerMetadata: {
              openai: {
                itemId: 'msg_1',
              },
            },
          }),
        ],
      } as unknown as UIMessage,
    ]

    const sanitized = sanitizeConversationMessages(messages)
    const assistant = sanitized[0] as unknown as Record<string, unknown>
    const reasoningPart = sanitized[0]?.parts[0] as unknown as Record<
      string,
      unknown
    >
    const textPart = sanitized[0]?.parts[1] as unknown as Record<
      string,
      unknown
    >
    const serialized = JSON.stringify(sanitized)

    expect(assistant.providerMetadata).toBeUndefined()
    expect(reasoningPart.providerMetadata).toBeUndefined()
    expect(textPart.providerMetadata).toBeUndefined()
    expect(serialized).not.toContain('reasoningEncryptedContent')
    expect(serialized.length).toBeLessThan(2_000)
  })

  it('removes tool provider call metadata before extension storage', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          asPart({
            type: 'tool-filesystem_bash',
            toolCallId: 'tool-1',
            state: 'output-available',
            input: { command: 'dir' },
            callProviderMetadata: {
              openai: {
                itemId: 'fc_1',
                encryptedPayload: 'x'.repeat(500_000),
              },
            },
            output: {
              content: [{ type: 'text', text: 'ok' }],
              isError: false,
            },
          }),
        ],
      } as UIMessage,
    ]

    const sanitized = sanitizeConversationMessages(messages)
    const toolPart = sanitized[0]?.parts[0] as unknown as Record<
      string,
      unknown
    >
    const serialized = JSON.stringify(sanitized)

    expect(toolPart.callProviderMetadata).toBeUndefined()
    expect(serialized).not.toContain('encryptedPayload')
    expect(serialized.length).toBeLessThan(2_000)
  })
})
