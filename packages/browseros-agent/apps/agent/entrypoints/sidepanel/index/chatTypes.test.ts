import { describe, expect, it } from 'bun:test'
import {
  CHAT_MODE_OPTIONS,
  type ChatMode,
  DEFAULT_CHAT_MODE,
  getSuggestionsForMode,
  normalizeChatMode,
} from './chatTypes'

describe('chatTypes', () => {
  it('exposes the local-first sidepanel modes', () => {
    expect(CHAT_MODE_OPTIONS.map((option) => option.mode)).toEqual([
      'chat',
      'research',
      'workflow',
      'agent',
      'goal',
    ])

    for (const mode of CHAT_MODE_OPTIONS.map((option) => option.mode)) {
      expect(getSuggestionsForMode(mode as ChatMode).length).toBeGreaterThan(0)
    }
  })

  it('defaults normal sidepanel use to chat and preserves agent mode', () => {
    expect(DEFAULT_CHAT_MODE).toBe('chat')
    expect(normalizeChatMode('agent')).toBe('agent')
    expect(normalizeChatMode('unknown')).toBe('chat')
  })
})
