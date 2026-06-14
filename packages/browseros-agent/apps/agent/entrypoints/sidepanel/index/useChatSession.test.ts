import { describe, expect, it } from 'bun:test'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import type { ChatMode } from './chatTypes'
import type { SidepanelChatTarget } from './sidepanel-chat-targets'
import { buildSidepanelPreparedSendMessagesRequest } from './useChatSessionRequest'
import {
  shouldRouteWorkspaceGoalToAgentChat,
  shouldSeedGoalLoopFromAttachedTabs,
} from './workspaceGoalRouting'

const conversationId = '00000000-0000-4000-8000-000000000001'

describe('buildSidepanelPreparedSendMessagesRequest', () => {
  it('keeps LLM targets on the existing /chat request body', () => {
    const request = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: llmTarget,
      fallbackProvider,
      message: 'Summarize this page',
      ...commonRequestInput(),
    })

    expect(request.api).toBe('http://127.0.0.1:5151/chat')
    expect(request.body).toMatchObject({
      message: 'Summarize this page',
      conversationId,
      provider: 'browseros',
      providerType: 'browseros',
      providerName: 'PannamOS',
      model: 'gpt-5',
      mode: 'goal',
      browserContext: {
        activeTab: { id: 10, url: 'https://example.com', title: 'Example' },
        enabledMcpServers: ['slack'],
      },
      userSystemPrompt: 'Be concise',
      userWorkingDir: '/tmp/work',
      previousConversation: [{ role: 'assistant', content: 'Prior answer' }],
      selectedText: 'selected text',
      selectedTextSource: {
        url: 'https://example.com',
        title: 'Example',
      },
    })
  })

  it('sends created-agent targets to the agent-id sidepanel route', () => {
    const request = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: acpTarget,
      fallbackProvider,
      message: 'Inspect the current tab',
      ...commonRequestInput(),
    })

    expect(request.api).toBe(
      'http://127.0.0.1:5151/agents/agent-codex/sidepanel/chat',
    )
    expect(request.body).toEqual({
      conversationId,
      message: 'Inspect the current tab',
      mode: 'goal',
      browserContext: {
        activeTab: { id: 10, url: 'https://example.com', title: 'Example' },
        enabledMcpServers: ['slack'],
        customMcpServers: [
          {
            name: 'Gmail',
            url: 'http://localhost:8000/sse',
          },
        ],
      },
      userSystemPrompt: 'Be concise',
      userWorkingDir: '/tmp/work',
      selectedText: 'selected text',
      selectedTextSource: {
        url: 'https://example.com',
        title: 'Example',
      },
    })
  })

  it('passes attachments and execution controls to created-agent sidepanel chat', () => {
    const request = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: acpTarget,
      fallbackProvider,
      message: 'Read this attachment',
      attachments: [
        {
          kind: 'file',
          mediaType: 'text/plain',
          name: 'notes.txt',
          text: 'hello',
        },
      ],
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      agentStrategy: { mode: 'parallel', maxWorkers: 3 },
      ...commonRequestInput(),
    })

    expect(request.body).toMatchObject({
      attachments: [
        {
          kind: 'file',
          mediaType: 'text/plain',
          name: 'notes.txt',
          text: 'hello',
        },
      ],
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      agentStrategy: { mode: 'parallel', maxWorkers: 3 },
    })
  })

  it('preserves every sidepanel mode for LLM and created-agent requests', () => {
    const modes: ChatMode[] = ['chat', 'research', 'workflow', 'agent', 'goal']

    for (const mode of modes) {
      const llmRequest = buildSidepanelPreparedSendMessagesRequest({
        agentServerUrl: 'http://127.0.0.1:5151',
        target: llmTarget,
        fallbackProvider,
        message: `Run ${mode}`,
        ...commonRequestInput(mode),
      })
      expect(llmRequest.body).toMatchObject({ mode })

      const agentRequest = buildSidepanelPreparedSendMessagesRequest({
        agentServerUrl: 'http://127.0.0.1:5151',
        target: acpTarget,
        fallbackProvider,
        message: `Run ${mode}`,
        ...commonRequestInput(mode),
      })
      expect(agentRequest.body).toMatchObject({ mode })
    }
  })

  it('keeps local connector tools out of chat mode request bodies', () => {
    const llmRequest = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: llmTarget,
      fallbackProvider,
      message: 'Only answer from the page',
      ...commonRequestInput('chat'),
    })

    expect(llmRequest.body.browserContext).toEqual({
      activeTab: { id: 10, url: 'https://example.com', title: 'Example' },
    })

    const agentRequest = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: acpTarget,
      fallbackProvider,
      message: 'Only answer from the page',
      ...commonRequestInput('chat'),
    })

    expect(agentRequest.body.browserContext).toEqual({
      activeTab: { id: 10, url: 'https://example.com', title: 'Example' },
    })
  })

  it('keeps local connector tools available for active modes', () => {
    for (const mode of ['research', 'workflow', 'agent', 'goal'] as const) {
      const request = buildSidepanelPreparedSendMessagesRequest({
        agentServerUrl: 'http://127.0.0.1:5151',
        target: llmTarget,
        fallbackProvider,
        message: `Use tools in ${mode}`,
        ...commonRequestInput(mode),
      })

      expect(request.body.browserContext).toMatchObject({
        enabledMcpServers: ['slack'],
        customMcpServers: [
          {
            name: 'Gmail',
            url: 'http://localhost:8000/sse',
          },
        ],
      })
    }
  })

  it('uses fallback provider when no explicit target is selected', () => {
    const request = buildSidepanelPreparedSendMessagesRequest({
      agentServerUrl: 'http://127.0.0.1:5151',
      target: undefined,
      fallbackProvider,
      ...commonRequestInput(),
    })

    expect(request.api).toBe('http://127.0.0.1:5151/chat')
    expect(request.body).toMatchObject({
      message: '',
      provider: 'browseros',
      model: 'gpt-5',
    })
  })
})

describe('shouldRouteWorkspaceGoalToAgentChat', () => {
  it('routes selected-workspace goals through agent chat so filesystem tools are available', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'go thru this workspace folder and tell me more about it',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
      ),
    ).toBe(true)
  })

  it('routes selected-workspace goals even when the current tab is auto-attached', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'go thru this workspace folder and tell me more about it',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
        {
          tabs: [
            {
              url: 'https://example.com/file.pdf',
            },
          ],
        },
      ),
    ).toBe(true)
  })

  it('routes explicit Windows-path goals through agent chat', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'Refer to this - C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator and continue until all countries or airports are complete',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
        {
          tabs: [
            {
              url: 'https://www.google.com/search?q=yahoo',
            },
          ],
        },
      ),
    ).toBe(true)
  })

  it('keeps browser tab goals on the durable Goal Loop path when the prompt is not about the workspace', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'download PDFs from these pages',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
        {
          tabs: [
            {
              url: 'https://example.com/file.pdf',
            },
          ],
        },
      ),
    ).toBe(false)
  })

  it('only seeds Goal Loop queue items from tabs when the prompt is about attached tabs', () => {
    const action = {
      tabs: [
        {
          url: 'https://www.google.com/search?q=yahoo',
        },
      ],
    }

    expect(
      shouldSeedGoalLoopFromAttachedTabs(
        'download PDFs from these pages',
        action,
      ),
    ).toBe(true)

    expect(
      shouldSeedGoalLoopFromAttachedTabs(
        'Refer to this - C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator and continue until all countries or airports are complete',
        action,
      ),
    ).toBe(false)

    expect(
      shouldSeedGoalLoopFromAttachedTabs(
        'please continue until all the countries or airports are complete',
        action,
      ),
    ).toBe(false)
  })

  it('routes selected-workspace status questions even without explicit workspace wording', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'okay now can you show me what countries / airports are blocked and remaining ?',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
      ),
    ).toBe(true)
  })

  it('keeps explicit browser navigation goals on the durable Goal Loop path', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'open https://example.com and summarize the current page',
        'C:\\Users\\pannam\\Desktop\\flightcanvas_data\\Procedure_chart_creator',
      ),
    ).toBe(false)
  })

  it('does not route ordinary goals without a selected workspace', () => {
    expect(
      shouldRouteWorkspaceGoalToAgentChat(
        'go thru this workspace folder and tell me more about it',
        null,
      ),
    ).toBe(false)
  })
})

function commonRequestInput(mode: ChatMode = 'goal') {
  return {
    conversationId,
    mode,
    browserContext: {
      activeTab: { id: 10, url: 'https://example.com', title: 'Example' },
      enabledMcpServers: ['slack'],
      customMcpServers: [
        {
          name: 'Gmail',
          url: 'http://localhost:8000/sse',
        },
      ],
    },
    userSystemPrompt: 'Be concise',
    userWorkingDir: '/tmp/work',
    previousConversation: [
      { role: 'assistant' as const, content: 'Prior answer' },
    ],
    declinedApps: ['gmail'],
    selectedText: 'selected text',
    selectedTextSource: {
      url: 'https://example.com',
      title: 'Example',
    },
  }
}

const fallbackProvider: LlmProviderConfig = {
  id: 'browseros',
  type: 'browseros',
  name: 'PannamOS',
  modelId: 'gpt-5',
  supportsImages: true,
  contextWindow: 128000,
  temperature: 0.7,
  createdAt: 1000,
  updatedAt: 1000,
}

const llmTarget: SidepanelChatTarget = {
  kind: 'llm',
  id: fallbackProvider.id,
  name: fallbackProvider.name,
  type: fallbackProvider.type,
  provider: fallbackProvider,
}

const acpTarget: SidepanelChatTarget = {
  kind: 'acp',
  id: 'agent-codex',
  name: 'Review bot',
  type: 'acp',
  agentId: 'agent-codex',
  adapter: 'codex',
  adapterName: 'Codex',
  modelId: 'gpt-5.5',
  modelLabel: 'GPT-5.5',
  modelControl: 'best-effort',
  reasoningEffort: 'medium',
  reasoningEffortLabel: 'Medium',
}
