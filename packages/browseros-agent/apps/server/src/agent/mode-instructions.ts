/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AgentMode } from './types'

interface ModeInstructionOptions {
  mode?: AgentMode
  chatMode?: boolean
  isScheduledTask?: boolean
}

export function getModeInstruction(
  options: ModeInstructionOptions = {},
): string {
  const mode = options.chatMode ? 'chat' : options.mode

  if (options.isScheduledTask) {
    const scheduledInstruction =
      'You are running as a scheduled background task on a system-managed hidden page. Complete the task autonomously and report results.'
    const modeInstruction = getStandaloneModeInstruction(mode)
    return modeInstruction
      ? `${scheduledInstruction}\n${modeInstruction}`
      : scheduledInstruction
  }

  return getStandaloneModeInstruction(mode)
}

function getStandaloneModeInstruction(mode?: AgentMode): string {
  if (mode === 'chat') {
    return 'You are in read-only chat mode. You can observe pages but cannot interact with them or modify files.'
  }
  if (mode === 'research') {
    return 'You are in local research mode. Browse and inspect sources, compare evidence, keep citations or source URLs in your answer, and avoid account or data-changing actions unless the user explicitly asks.'
  }
  if (mode === 'workflow') {
    return 'You are in local workflow mode. Focus on repeatable browser steps, form filling, extraction, and structured output. Pause for approval before submitting, uploading, deleting, purchasing, messaging, or changing account settings.'
  }
  if (mode === 'agent') {
    return 'You are in direct agent mode with Full Browser Access and all available local tools. Use browser, workspace filesystem, connected app, and MCP tools directly to complete the user request. Do not ask approval for browser commands; execute requested navigation, clicks, forms, downloads, login/registration steps, credential entry, uploads, account changes, and verification directly when the user request requires them. Pause only when the work is technically blocked, ambiguous, or requires information the user has not provided.'
  }
  if (mode === 'goal') {
    return 'You are in autonomous goal mode with Full Browser Access. Work step by step until the user goal is complete or genuinely blocked. Do not ask approval for browser commands; execute requested navigation, clicks, forms, downloads, login/registration steps, credential entry, uploads, account changes, and verification directly when the user goal requires them. Pause only when the work is technically blocked, ambiguous, or requires information the user has not provided. Before final response, close temporary task tabs you opened and leave only useful user-facing tabs.'
  }

  return ''
}
