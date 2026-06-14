import { describe, expect, it, mock } from 'bun:test'
import {
  getDefaultBaseUrlForProviders,
  getProviderTemplate,
  providerTemplates,
  providerTypeOptions,
} from './providerTemplates'
import type { LlmProviderConfig } from './types'

const BROWSEROS_DOT_COM = ['browseros', 'com'].join('.')

mock.module('@wxt-dev/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: async () => undefined,
      setValue: async () => undefined,
      watch: () => () => undefined,
    }),
  },
}))

mock.module('@/lib/auth/sessionStorage', () => ({
  sessionStorage: {
    getValue: async () => undefined,
  },
}))

mock.module('@/lib/browseros/adapter', () => ({
  getBrowserOSAdapter: () => ({
    setPref: async () => undefined,
  }),
}))

mock.module('@/lib/browseros/prefs', () => ({
  BROWSEROS_PREFS: {
    PROVIDERS: 'browseros.providers',
  },
}))

const loadStorage = async () => await import('./storage')

const legacyBrowserOSProvider: LlmProviderConfig = {
  id: 'browseros',
  type: 'browseros',
  name: 'BrowserOS',
  baseUrl: ['https://llm', BROWSEROS_DOT_COM].join('.'),
  modelId: 'browseros',
  supportsImages: true,
  contextWindow: 128000,
  temperature: 0.2,
  createdAt: 1,
  updatedAt: 1,
}

describe('private provider templates', () => {
  it('does not expose upstream cloud setup links in runtime provider setup', () => {
    expect(JSON.stringify(providerTemplates)).not.toContain(BROWSEROS_DOT_COM)
  })

  it('does not offer upstream cloud as a new provider type', () => {
    expect(
      providerTemplates.some((template) => template.id === 'browseros'),
    ).toBe(false)
    expect(
      providerTypeOptions.some((option) => option.value === 'browseros'),
    ).toBe(false)
    expect(getProviderTemplate('browseros')).toBeUndefined()
  })

  it('exposes OpenAI API, local ChatGPT OAuth, and OpenAI-compatible setup', () => {
    expect(providerTemplates.map((template) => template.id)).toEqual([
      'openai',
      'chatgpt-pro',
      'openai-compatible',
    ])
    expect(providerTypeOptions.map((option) => option.value)).toEqual([
      'openai',
      'chatgpt-pro',
      'openai-compatible',
    ])
    expect(getProviderTemplate('chatgpt-pro')).toMatchObject({
      id: 'chatgpt-pro',
      name: 'ChatGPT Plus/Pro',
      defaultModelId: 'gpt-5.5',
      contextWindow: 400000,
    })
  })

  it('does not keep default URLs for disabled v1 provider types', () => {
    expect(getDefaultBaseUrlForProviders('openai')).toBe(
      'https://api.openai.com/v1',
    )
    expect(getDefaultBaseUrlForProviders('openai-compatible')).toBe('')
    expect(getDefaultBaseUrlForProviders('chatgpt-pro')).toBe('')
    expect(getDefaultBaseUrlForProviders('anthropic')).toBe('')
    expect(getDefaultBaseUrlForProviders('ollama')).toBe('')
  })
})

describe('private provider defaults', () => {
  it('creates a provider-only default without upstream cloud provider metadata', async () => {
    const { createDefaultProvidersConfig } = await loadStorage()
    const defaults = createDefaultProvidersConfig()

    expect(defaults).toHaveLength(1)
    expect(defaults[0]).toMatchObject({
      id: 'openai',
      type: 'openai',
      name: 'OpenAI API',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-5',
    })
    expect(JSON.stringify(defaults)).not.toContain(BROWSEROS_DOT_COM)
  })

  it('filters legacy upstream cloud providers but preserves local ChatGPT OAuth providers', async () => {
    const { normalizeProvidersForPrivateBuild } = await loadStorage()
    const normalized = normalizeProvidersForPrivateBuild([
      legacyBrowserOSProvider,
      {
        ...legacyBrowserOSProvider,
        id: 'chatgpt-pro',
        type: 'chatgpt-pro',
        name: 'ChatGPT Plus/Pro',
        baseUrl: 'https://chatgpt.com/backend-api',
        modelId: 'gpt-5.3-codex',
      },
    ])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({
      id: 'chatgpt-pro',
      type: 'chatgpt-pro',
      name: 'ChatGPT Plus/Pro',
      modelId: 'gpt-5.5',
    })
  })
})
