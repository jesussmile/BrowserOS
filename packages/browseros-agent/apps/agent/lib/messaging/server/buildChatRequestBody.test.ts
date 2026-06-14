import { describe, expect, it } from 'bun:test'
import type { LlmProviderConfig } from '@/lib/llm-providers/types'
import { buildChatRequestBody } from './buildChatRequestBody'

const provider: LlmProviderConfig = {
  id: 'browseros',
  type: 'browseros',
  name: 'BrowserOS',
  modelId: 'browseros-auto',
  supportsImages: true,
  contextWindow: 200000,
  temperature: 0,
  createdAt: 0,
  updatedAt: 0,
}

describe('buildChatRequestBody', () => {
  it('preserves browser context and chat metadata', () => {
    const body = buildChatRequestBody({
      conversationId: '6ff46e3b-e45a-40a4-9157-ca520e800f43',
      provider,
      mode: 'goal',
      browserContext: {
        windowId: 2,
        activeTab: {
          id: 10,
          url: 'https://amazon.com',
          title: 'Amazon',
        },
        customMcpServers: [
          {
            name: 'Gmail',
            url: 'http://localhost:8000/sse',
          },
        ],
      },
      userSystemPrompt: 'Stay in the current tab.',
      declinedApps: ['gmail'],
    })

    expect(body.browserContext).toEqual({
      windowId: 2,
      activeTab: {
        id: 10,
        url: 'https://amazon.com',
        title: 'Amazon',
      },
      customMcpServers: [
        {
          name: 'Gmail',
          url: 'http://localhost:8000/sse',
        },
      ],
    })
    expect(body.userSystemPrompt).toBe('Stay in the current tab.')
    expect(body.declinedApps).toEqual(['gmail'])
  })

  it('carries attachments and Goal Loop execution controls', () => {
    const body = buildChatRequestBody({
      conversationId: '6ff46e3b-e45a-40a4-9157-ca520e800f43',
      provider,
      mode: 'goal',
      message: 'Read this file',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      agentStrategy: { mode: 'parallel', maxWorkers: 3 },
      attachments: [
        {
          kind: 'file',
          mediaType: 'text/plain',
          name: 'notes.txt',
          text: 'hello',
        },
      ],
    })

    expect(body).toMatchObject({
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      agentStrategy: { mode: 'parallel', maxWorkers: 3 },
      attachments: [
        {
          kind: 'file',
          mediaType: 'text/plain',
          name: 'notes.txt',
          text: 'hello',
        },
      ],
    })
  })
})
