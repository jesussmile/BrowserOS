import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { LlmProviderConfig } from './types'
import { uploadLlmProvidersToGraphql } from './uploadLlmProvidersToGraphql'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('uploadLlmProvidersToGraphql', () => {
  it('does not upload provider metadata in the private local-first build', async () => {
    const fetchMock = mock(() => {
      throw new Error('unexpected network call')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const provider: LlmProviderConfig = {
      id: 'openai-local',
      type: 'openai',
      name: 'OpenAI',
      modelId: 'gpt-5',
      supportsImages: true,
      contextWindow: 128000,
      temperature: 0.2,
      createdAt: 1,
      updatedAt: 1,
    }

    await uploadLlmProvidersToGraphql([provider], 'user-1')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
