import { afterEach, describe, expect, it, mock } from 'bun:test'
import type { TypedDocumentString } from '@/generated/graphql/graphql'
import { execute } from './execute'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('execute', () => {
  it('fails closed without calling upstream GraphQL in the private build', async () => {
    const fetchMock = mock(() => {
      throw new Error('unexpected network call')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const query =
      'query LocalOnly { __typename }' as unknown as TypedDocumentString<
        { __typename: string },
        undefined
      >

    await expect(execute(query)).rejects.toThrow(
      'Upstream GraphQL sync is disabled',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
