/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const CHAT_MODE_ALLOWED_TOOLS = new Set([
  'list_pages',
  'get_page_content',
  'take_snapshot',
  'take_enhanced_snapshot',
])

export function isChatModeAllowedTool(toolName: string): boolean {
  return CHAT_MODE_ALLOWED_TOOLS.has(toolName)
}
