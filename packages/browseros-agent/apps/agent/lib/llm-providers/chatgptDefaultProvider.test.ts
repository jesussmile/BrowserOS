import { describe, expect, it } from 'bun:test'
import {
  applyAuthenticatedChatGPTProvider,
  shouldPreferAuthenticatedChatGPTProvider,
} from './chatgptDefaultProvider'
import type { LlmProviderConfig } from './types'

function provider(overrides: Partial<LlmProviderConfig>): LlmProviderConfig {
  return {
    id: 'provider-1',
    type: 'openai',
    name: 'Provider',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5',
    supportsImages: true,
    contextWindow: 128000,
    temperature: 0.2,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('shouldPreferAuthenticatedChatGPTProvider', () => {
  it('selects ChatGPT when there is no current default provider', () => {
    expect(shouldPreferAuthenticatedChatGPTProvider(undefined)).toBe(true)
  })

  it('selects ChatGPT over an empty OpenAI API placeholder', () => {
    expect(
      shouldPreferAuthenticatedChatGPTProvider(provider({ type: 'openai' })),
    ).toBe(true)
  })

  it('does not override a configured OpenAI API provider', () => {
    expect(
      shouldPreferAuthenticatedChatGPTProvider(
        provider({ type: 'openai', apiKey: 'sk-local-test' }),
      ),
    ).toBe(false)
  })

  it('does not override an OpenAI-compatible local provider without an API key', () => {
    expect(
      shouldPreferAuthenticatedChatGPTProvider(
        provider({
          type: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:11434/v1',
          apiKey: undefined,
        }),
      ),
    ).toBe(false)
  })

  it('selects ChatGPT over removed upstream BrowserOS cloud defaults', () => {
    expect(
      shouldPreferAuthenticatedChatGPTProvider(
        provider({ type: 'browseros', id: 'browseros' }),
      ),
    ).toBe(true)
  })
})

describe('applyAuthenticatedChatGPTProvider', () => {
  it('adds ChatGPT Plus/Pro and selects it over an empty OpenAI API placeholder', () => {
    const openAiProvider = provider({ id: 'openai' })

    const result = applyAuthenticatedChatGPTProvider(
      [openAiProvider],
      'openai',
      { email: 'user@example.com' },
      123,
    )

    expect(result.providersChanged).toBe(true)
    expect(result.defaultProviderChanged).toBe(true)
    expect(result.defaultProviderId).toBe('chatgpt-pro-123')
    expect(result.providers).toHaveLength(2)
    expect(result.providers[1]).toMatchObject({
      id: 'chatgpt-pro-123',
      type: 'chatgpt-pro',
      name: 'ChatGPT Plus/Pro (user@example.com)',
      modelId: 'gpt-5.5',
    })
  })

  it('keeps an explicitly configured API provider as the default', () => {
    const openAiProvider = provider({ id: 'openai', apiKey: 'sk-local-test' })

    const result = applyAuthenticatedChatGPTProvider(
      [openAiProvider],
      'openai',
      { email: 'user@example.com' },
      123,
    )

    expect(result.providersChanged).toBe(true)
    expect(result.defaultProviderChanged).toBe(false)
    expect(result.defaultProviderId).toBe('openai')
  })

  it('keeps an OpenAI-compatible local provider as the default', () => {
    const localProvider = provider({
      id: 'local',
      type: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: undefined,
    })

    const result = applyAuthenticatedChatGPTProvider(
      [localProvider],
      'local',
      { email: 'user@example.com' },
      123,
    )

    expect(result.providersChanged).toBe(true)
    expect(result.defaultProviderChanged).toBe(false)
    expect(result.defaultProviderId).toBe('local')
  })

  it('does not duplicate an existing ChatGPT Plus/Pro provider', () => {
    const chatgptProvider = provider({
      id: 'chatgpt-existing',
      type: 'chatgpt-pro',
      name: 'ChatGPT Plus/Pro',
      apiKey: undefined,
    })

    const result = applyAuthenticatedChatGPTProvider(
      [chatgptProvider],
      'chatgpt-existing',
      { email: 'user@example.com' },
      123,
    )

    expect(result.providersChanged).toBe(false)
    expect(result.defaultProviderChanged).toBe(false)
    expect(result.providers).toHaveLength(1)
  })
})
