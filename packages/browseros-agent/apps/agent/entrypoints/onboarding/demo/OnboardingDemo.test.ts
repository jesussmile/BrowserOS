import { describe, expect, it } from 'bun:test'
import { buildDefaultSuggestions } from './onboardingDemoSuggestions'

describe('onboarding demo suggestions', () => {
  it('introduces every local PannamOS mode in the first-run defaults', () => {
    const suggestions = buildDefaultSuggestions()

    expect(suggestions.map((suggestion) => suggestion.mode)).toEqual([
      'research',
      'research',
      'workflow',
      'chat',
    ])
  })

  it('routes company news suggestions through research mode', () => {
    const [companySuggestion] = buildDefaultSuggestions('Acme')

    expect(companySuggestion).toMatchObject({
      mode: 'research',
      query: 'Search for Acme and summarize the latest news about them',
    })
  })
})
