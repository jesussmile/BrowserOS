import { afterEach, describe, expect, it, mock } from 'bun:test'
import { uploadConversationsToGraphql } from './uploadConversationsToGraphql'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('uploadConversationsToGraphql', () => {
  it('does not upload conversations in the private local-first build', async () => {
    const fetchMock = mock(() => {
      throw new Error('unexpected network call')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await uploadConversationsToGraphql([
      {
        id: 'session-1',
        messages: [],
        lastMessagedAt: 1,
      },
    ])

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
