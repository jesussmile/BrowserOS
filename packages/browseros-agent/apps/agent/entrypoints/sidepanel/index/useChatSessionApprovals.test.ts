import { describe, expect, it } from 'bun:test'
import type { UIMessage } from 'ai'
import {
  createApprovalAutoSendPredicate,
  extractToolApprovalResponses,
  getOutgoingMessageText,
} from './useChatSessionApprovals'

describe('useChatSessionApprovals', () => {
  it('extracts approval responses from the last assistant message', () => {
    const messages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-click',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { page: 1, element: 2 },
            approval: { id: 'approval-1', approved: true },
          } as UIMessage['parts'][number],
        ],
      },
    ]

    expect(extractToolApprovalResponses(messages)).toEqual([
      { id: 'approval-1', approved: true, reason: undefined },
    ])
  })

  it('does not turn assistant text into a new user message', () => {
    const messages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Waiting for approval' }],
      },
    ]

    expect(getOutgoingMessageText(messages)).toBe('')
  })

  it('uses the latest user message as the outgoing message', () => {
    const messages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Fill the form' }],
      },
    ]

    expect(getOutgoingMessageText(messages)).toBe('Fill the form')
  })

  it('auto-sends each approval response set only once', () => {
    const shouldAutoSend = createApprovalAutoSendPredicate()
    const messages: UIMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-evaluate_script',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { expression: 'document.body.innerText' },
            approval: { id: 'approval-1', approved: true },
          } as UIMessage['parts'][number],
        ],
      },
    ]

    expect(shouldAutoSend({ messages })).toBe(true)
    expect(shouldAutoSend({ messages })).toBe(false)
  })
})
