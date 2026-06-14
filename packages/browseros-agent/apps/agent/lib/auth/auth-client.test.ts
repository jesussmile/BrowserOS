import { afterEach, describe, expect, it, mock } from 'bun:test'
import { signIn, signOut, signUp, useSession } from './auth-client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('local-only auth client', () => {
  it('does not call upstream account auth endpoints', async () => {
    const fetchMock = mock(() => {
      throw new Error('unexpected network call')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    expect(useSession()).toMatchObject({
      data: null,
      isPending: false,
    })

    const signInResult = await signIn()
    const signUpResult = await signUp()
    expect(signInResult.data).toBeNull()
    expect(signInResult.error?.message).toContain('disabled')
    expect(signUpResult.data).toBeNull()
    expect(signUpResult.error?.message).toContain('disabled')
    await expect(signOut()).resolves.toEqual({ data: null, error: null })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
