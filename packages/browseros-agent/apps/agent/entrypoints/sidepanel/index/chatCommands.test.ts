import { describe, expect, it } from 'bun:test'
import { isCompactCommand } from './chatCommands'

describe('sidepanel chat commands', () => {
  it('recognizes the manual compact slash commands', () => {
    expect(isCompactCommand('/compact')).toBe(true)
    expect(isCompactCommand(' /compact ')).toBe(true)
    expect(isCompactCommand('/COMPACT')).toBe(true)
    expect(isCompactCommand('/c')).toBe(true)
  })

  it('does not compact ordinary prompts', () => {
    expect(isCompactCommand('compact this result')).toBe(false)
    expect(isCompactCommand('/compact now')).toBe(false)
    expect(isCompactCommand('')).toBe(false)
  })
})
