import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ChatMode } from '@/entrypoints/sidepanel/index/chatTypes'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import type { McpServer } from '@/lib/mcp/mcpServerTypes'

const originalFetch = globalThis.fetch
const BROWSEROS_DOT_COM = ['browseros', 'com'].join('.')

const provider: LlmProviderConfig = {
  id: 'openai-local',
  type: 'openai-compatible',
  name: 'Local OpenAI-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  modelId: 'local-model',
  supportsImages: false,
  contextWindow: 32000,
  temperature: 0.2,
  createdAt: 0,
  updatedAt: 0,
}

let providers: LlmProviderConfig[] = []
let defaultProviderId: string | undefined
let mcpServers: McpServer[] = []
let personalization = ''

mock.module('@/entrypoints/sidepanel/index/chatTypes', () => ({
  DEFAULT_CHAT_MODE: 'goal',
}))

mock.module('@/lib/browseros/helpers', () => ({
  getAgentServerUrl: async () => 'http://127.0.0.1:5151',
}))

mock.module('@/lib/llm-providers/storage', () => ({
  createDefaultPannamOSProvider: () => provider,
  defaultProviderIdStorage: {
    getValue: async () => defaultProviderId,
  },
  providersStorage: {
    getValue: async () => providers,
  },
}))

mock.module('@/lib/mcp/mcpServerStorage', () => ({
  isLiveMcpServer: (server: McpServer) =>
    server.config?.url?.startsWith('http://127.0.0.1') ||
    server.config?.url?.startsWith('http://localhost'),
  mcpServerStorage: {
    getValue: async () => mcpServers,
  },
}))

mock.module('@/lib/messaging/server/buildChatRequestBody', () => ({
  buildChatRequestBody: ({
    conversationId,
    provider,
    message = '',
    mode,
    browserContext,
    userSystemPrompt,
    supportsImages,
    isScheduledTask,
  }: {
    conversationId: string
    provider: LlmProviderConfig
    message?: string
    mode?: ChatMode
    browserContext?: unknown
    userSystemPrompt?: string
    supportsImages?: boolean
    isScheduledTask?: boolean
  }) => ({
    message,
    provider: provider.type,
    providerType: provider.type,
    providerName: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    conversationId,
    model: provider.modelId,
    mode,
    contextWindowSize: provider.contextWindow,
    temperature: provider.temperature,
    browserContext,
    userSystemPrompt,
    supportsImages: supportsImages ?? provider.supportsImages,
    isScheduledTask,
  }),
}))

mock.module('../personalization/personalizationStorage', () => ({
  personalizationStorage: {
    getValue: async () => personalization,
  },
}))

interface CapturedChatRequest {
  url: string
  body: Record<string, unknown>
}

const makeStreamResponse = (text = 'scheduled result') =>
  new Response(
    [
      `data: ${JSON.stringify({ type: 'text-delta', id: '1', delta: text })}`,
      `data: ${JSON.stringify({ type: 'finish', finishReason: 'stop' })}`,
      'data: [DONE]',
      '',
    ].join('\n\n'),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )

const installFetchCapture = (captures: CapturedChatRequest[]) => {
  globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    captures.push({
      url,
      body: JSON.parse(String(init?.body ?? '{}')),
    })
    return Promise.resolve(makeStreamResponse())
  }) as unknown as typeof fetch
}

const loadSubject = async () => await import('./getChatServerResponse')

beforeEach(() => {
  providers = [provider]
  defaultProviderId = provider.id
  personalization = 'Prefer concise scheduled updates.'
  mcpServers = [
    {
      id: 'local-mcp',
      displayName: 'Local Browser Tool',
      type: 'custom',
      config: { url: 'http://127.0.0.1:7400/sse' },
    },
    {
      id: 'remote-mcp',
      displayName: 'Remote Tool',
      type: 'custom',
      config: { url: 'https://example.com/sse' },
    },
  ]
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('getChatServerResponse', () => {
  it('posts scheduled mode requests only to the local chat server', async () => {
    const captures: CapturedChatRequest[] = []
    installFetchCapture(captures)
    const { getChatServerResponse } = await loadSubject()

    const response = await getChatServerResponse({
      message: 'Research the current page',
      mode: 'research',
      conversationId: '00000000-0000-4000-8000-000000000123',
      windowId: 7,
      activeTab: {
        id: 8,
        url: 'https://example.com/report',
        title: 'Example report',
      },
      providerId: provider.id,
    })

    expect(response.text).toBe('scheduled result')
    expect(captures).toHaveLength(1)
    expect(captures[0].url).toBe('http://127.0.0.1:5151/chat')

    const body = captures[0].body
    expect(body.messages).toEqual([
      { role: 'user', content: 'Research the current page' },
    ])
    expect(body.message).toBe('Research the current page')
    expect(body.mode).toBe('research' satisfies ChatMode)
    expect(body.isScheduledTask).toBe(true)
    expect(body.provider).toBe('openai-compatible')
    expect(body.baseUrl).toBe('http://127.0.0.1:11434/v1')
    expect(body.apiKey).toBeUndefined()
    expect(body.browserContext).toEqual({
      windowId: 7,
      activeTab: {
        id: 8,
        url: 'https://example.com/report',
        title: 'Example report',
      },
      customMcpServers: [
        {
          name: 'Local Browser Tool',
          url: 'http://127.0.0.1:7400/sse',
        },
      ],
    })
    expect(String(body.userSystemPrompt)).toContain(
      'Prefer concise scheduled updates.',
    )
    expect(JSON.stringify(body)).not.toContain(BROWSEROS_DOT_COM)
  })

  it('defaults scheduled jobs to goal mode when no mode is supplied', async () => {
    const captures: CapturedChatRequest[] = []
    installFetchCapture(captures)
    const { getChatServerResponse } = await loadSubject()

    await getChatServerResponse({
      message: 'Run the scheduled workflow',
      conversationId: '00000000-0000-4000-8000-000000000124',
    })

    expect(captures).toHaveLength(1)
    expect(captures[0].url).toBe('http://127.0.0.1:5151/chat')
    expect(captures[0].body.mode).toBe('goal' satisfies ChatMode)
    expect(captures[0].body.isScheduledTask).toBe(true)
  })
})
