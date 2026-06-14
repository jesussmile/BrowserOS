import type { Provider } from '../../../components/chat/chatComponentTypes'
import type { LlmProviderConfig } from '../../../lib/llm-providers/types'
import {
  buildChatRequestBody,
  type ChatRequestBrowserContext,
} from '../../../lib/messaging/server/buildChatRequestBody'
import type { ChatMode } from './chatTypes'
import {
  type SidepanelChatTarget,
  toLlmProviderConfig,
} from './sidepanel-chat-targets'

type LlmChatRequestBodyInput = Parameters<typeof buildChatRequestBody>[0]

type CommonSidepanelRequestInput = Omit<
  LlmChatRequestBodyInput,
  'provider' | 'message' | 'isScheduledTask'
>

interface BuildSidepanelPreparedSendMessagesRequestInput
  extends CommonSidepanelRequestInput {
  agentServerUrl: string | undefined
  target: SidepanelChatTarget | undefined
  fallbackProvider: LlmProviderConfig
  message?: string
  approvalResponses?: LlmChatRequestBodyInput['approvalResponses']
  attachments?: LlmChatRequestBodyInput['attachments']
  approvalPolicy?: LlmChatRequestBodyInput['approvalPolicy']
  agentStrategy?: LlmChatRequestBodyInput['agentStrategy']
}

export function buildSidepanelPreparedSendMessagesRequest({
  agentServerUrl,
  target,
  fallbackProvider,
  message,
  approvalResponses,
  attachments,
  approvalPolicy,
  agentStrategy,
  ...common
}: BuildSidepanelPreparedSendMessagesRequestInput) {
  const browserContext = filterBrowserContextForMode(
    common.mode,
    common.browserContext,
  )

  if (target?.kind === 'acp') {
    return {
      api: `${agentServerUrl}/agents/${encodeURIComponent(target.agentId)}/sidepanel/chat`,
      body: {
        conversationId: common.conversationId,
        message: message ?? '',
        mode: common.mode,
        browserContext,
        userSystemPrompt: common.userSystemPrompt,
        userWorkingDir: common.userWorkingDir,
        selectedText: common.selectedText,
        selectedTextSource: common.selectedTextSource,
        ...(approvalResponses?.length ? { approvalResponses } : {}),
        ...(attachments?.length ? { attachments } : {}),
        ...(approvalPolicy ? { approvalPolicy } : {}),
        ...(agentStrategy ? { agentStrategy } : {}),
      },
    }
  }

  const provider = toLlmProviderConfig(target) ?? fallbackProvider
  return {
    api: `${agentServerUrl}/chat`,
    body: buildChatRequestBody({
      ...common,
      browserContext,
      provider,
      message,
      approvalResponses,
      attachments,
      approvalPolicy,
      agentStrategy,
    }),
  }
}

function filterBrowserContextForMode(
  mode: ChatMode | undefined,
  browserContext: ChatRequestBrowserContext | undefined,
): ChatRequestBrowserContext | undefined {
  if (mode !== 'chat' || !browserContext) return browserContext

  const { enabledMcpServers, customMcpServers, ...readOnlyContext } =
    browserContext
  void enabledMcpServers
  void customMcpServers

  return Object.keys(readOnlyContext).length ? readOnlyContext : undefined
}

export function toProviderOption(target: SidepanelChatTarget): Provider {
  return {
    id: target.id,
    name: target.name,
    type: target.type,
    kind: target.kind,
    agentId: target.kind === 'acp' ? target.agentId : undefined,
    adapterName: target.kind === 'acp' ? target.adapterName : undefined,
    modelLabel: target.kind === 'acp' ? target.modelLabel : undefined,
    modelControl: target.kind === 'acp' ? target.modelControl : undefined,
  }
}
