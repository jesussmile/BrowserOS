import { describe, expect, it } from 'bun:test'
import {
  LLM_HUB_HEADER_DESCRIPTION,
  LLM_HUB_HEADER_TITLE,
} from './LlmHubHeader'

describe('LlmHubHeader copy', () => {
  it('uses Chat Provider wording without legacy Council or Hub labels', () => {
    expect(LLM_HUB_HEADER_TITLE).toBe('Chat Provider')
    expect(`${LLM_HUB_HEADER_TITLE} ${LLM_HUB_HEADER_DESCRIPTION}`).not.toMatch(
      /Council|Chat\s*&\s*Hub/i,
    )
  })
})
