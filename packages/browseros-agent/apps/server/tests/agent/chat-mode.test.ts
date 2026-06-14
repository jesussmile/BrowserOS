/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import {
  CHAT_MODE_ALLOWED_TOOLS,
  isChatModeAllowedTool,
} from '../../src/agent/chat-mode'

describe('chat mode tool allowlist', () => {
  it('only allows observe-only PannamOS browser tools', () => {
    expect([...CHAT_MODE_ALLOWED_TOOLS]).toEqual([
      'list_pages',
      'get_page_content',
      'take_snapshot',
      'take_enhanced_snapshot',
    ])
  })

  it('rejects page mutation, JavaScript execution, and navigation tools', () => {
    for (const toolName of [
      'click',
      'fill',
      'type_at',
      'navigate',
      'scroll',
      'evaluate_script',
      'download_file',
      'upload_file',
    ]) {
      expect(isChatModeAllowedTool(toolName)).toBe(false)
    }
  })
})
