import { describe, expect, it } from 'bun:test'
import { canSendInitialNewTabMessage } from './newtabInitialMessage'

describe('canSendInitialNewTabMessage', () => {
  it('waits for provider hydration before sending URL query prompts', () => {
    expect(
      canSendInitialNewTabMessage({
        query: 'hi',
        isLoading: true,
        hasSelectedProvider: true,
      }),
    ).toBe(false)

    expect(
      canSendInitialNewTabMessage({
        query: 'hi',
        isLoading: false,
        hasSelectedProvider: false,
      }),
    ).toBe(false)

    expect(
      canSendInitialNewTabMessage({
        query: 'hi',
        isLoading: false,
        hasSelectedProvider: true,
      }),
    ).toBe(true)
  })

  it('does not send empty URL query prompts', () => {
    expect(
      canSendInitialNewTabMessage({
        query: '   ',
        isLoading: false,
        hasSelectedProvider: true,
      }),
    ).toBe(false)
  })
})
