/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { LLMProvider } from '@browseros/shared/schemas/llm'

export type AgentMode = 'chat' | 'research' | 'workflow' | 'agent' | 'goal'

export interface ProviderConfig {
  provider: LLMProvider
  model: string
  apiKey?: string
  baseUrl?: string
  upstreamProvider?: string
  resourceName?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export interface ResolvedAgentConfig {
  conversationId: string
  provider: LLMProvider
  model: string
  apiKey?: string
  baseUrl?: string
  upstreamProvider?: string
  resourceName?: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  accountId?: string
  reasoningEffort?: string
  reasoningSummary?: string
  contextWindowSize?: number
  userSystemPrompt?: string
  workingDir?: string
  defaultOutputDir?: string
  /** Whether the model supports image inputs (vision). Defaults to true. */
  supportsImages?: boolean
  /** Eval mode - enables window management tools. Defaults to false. */
  evalMode?: boolean
  /** Chat mode - restricts to read-only tools (no browser automation). Defaults to false. */
  chatMode?: boolean
  /** Local product mode selected by the user. */
  mode?: AgentMode
  /** Scheduled task mode - disables tab grouping. Defaults to false. */
  isScheduledTask?: boolean
  /** Apps the user previously declined to connect via MCP (chose "do it manually"). */
  declinedApps?: string[]
  /** Where the chat session originates from — determines navigation behavior. */
  origin?: 'sidepanel' | 'newtab'
  /** Stable local installation ID for provider/session routing. */
  browserosId?: string
  /** Per-goal browser approval policy. */
  approvalPolicy?: {
    mode: 'supervised' | 'full_browser'
    scope: 'goal_run'
  }
  /** Adaptive agent strategy selected by the UI/planner. */
  agentStrategy?: {
    mode: 'auto' | 'single' | 'parallel'
    maxWorkers?: number
  }
}
