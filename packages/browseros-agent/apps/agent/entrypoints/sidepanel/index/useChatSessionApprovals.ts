import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import type { ChatApprovalResponse } from '@/lib/messaging/server/buildChatRequestBody'

export type ToolApprovalResponder = (response: ChatApprovalResponse) => void
export type ApprovalAutoSendPredicate = (options: {
  messages: UIMessage[]
}) => boolean

export function extractToolApprovalResponses(
  messages: UIMessage[],
): ChatApprovalResponse[] | undefined {
  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || lastMessage.role !== 'assistant') return undefined

  const responses = lastMessage.parts.flatMap((part) => {
    const approval = (part as { state?: string; approval?: unknown }).approval
    if (
      (part as { state?: string }).state !== 'approval-responded' ||
      !approval ||
      typeof approval !== 'object'
    ) {
      return []
    }

    const typedApproval = approval as {
      id?: unknown
      approved?: unknown
      reason?: unknown
    }
    if (
      typeof typedApproval.id !== 'string' ||
      typeof typedApproval.approved !== 'boolean'
    ) {
      return []
    }

    return [
      {
        id: typedApproval.id,
        approved: typedApproval.approved,
        reason:
          typeof typedApproval.reason === 'string'
            ? typedApproval.reason
            : undefined,
      },
    ]
  })

  return responses.length ? responses : undefined
}

export function getOutgoingMessageText(messages: UIMessage[]): string {
  const lastMessage = messages[messages.length - 1]
  return lastMessage?.role === 'user' ? getMessageText(lastMessage) : ''
}

export function createApprovalAutoSendPredicate(): ApprovalAutoSendPredicate {
  const submittedApprovalKeys = new Set<string>()

  return ({ messages }) => {
    if (!lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) {
      return false
    }

    const responses = extractToolApprovalResponses(messages)
    if (!responses?.length) return false

    const lastMessage = messages[messages.length - 1]
    const responseKey = responses
      .map(
        (response) =>
          `${response.id}:${response.approved ? 'approved' : 'denied'}:${
            response.reason ?? ''
          }`,
      )
      .sort()
      .join('|')
    const key = `${lastMessage?.id ?? 'unknown'}:${responseKey}`

    if (submittedApprovalKeys.has(key)) return false
    submittedApprovalKeys.add(key)
    return true
  }
}

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}
