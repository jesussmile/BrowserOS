import { describe, expect, it } from 'bun:test'
import { useBrowserOSSuggestions } from './useBrowserOSSuggestions'

describe('useBrowserOSSuggestions', () => {
  it('exposes every local PannamOS mode from the new-tab launcher', () => {
    const suggestions = useBrowserOSSuggestions({ query: 'compare vendors' })

    expect(suggestions.map((suggestion) => suggestion.mode)).toEqual([
      'goal',
      'chat',
      'research',
      'workflow',
    ])
    expect(
      suggestions.every(
        (suggestion) => suggestion.message === 'compare vendors',
      ),
    ).toBe(true)
  })

  it('does not offer empty PannamOS mode actions', () => {
    expect(useBrowserOSSuggestions({ query: '   ' })).toEqual([])
  })
})
