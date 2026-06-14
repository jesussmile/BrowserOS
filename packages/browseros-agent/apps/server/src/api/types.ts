/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  type BrowserContext,
  BrowserContextSchema,
  type CustomMcpServer,
  CustomMcpServerSchema,
  type Tab,
  TabSchema,
} from '@browseros/shared/schemas/browser-context'
import { LLMConfigSchema } from '@browseros/shared/schemas/llm'
import { z } from 'zod'
import type { AgentMode } from '../agent/types'
import type { Browser } from '../browser/browser'
import type { ToolRegistry } from '../tools/tool-registry'

// Re-export browser context types for consumers
export {
  type BrowserContext,
  BrowserContextSchema,
  type CustomMcpServer,
  CustomMcpServerSchema,
  type Tab,
  TabSchema,
}

export const AgentLLMConfigSchema = LLMConfigSchema.extend({
  model: z.string().min(1, 'Model name is required'),
  upstreamProvider: z.string().optional(),
})

export type AgentLLMConfig = z.infer<typeof AgentLLMConfigSchema>

const ChatRequestModeSchema = z
  .enum(['chat', 'research', 'workflow', 'goal', 'agent'])
  .optional()
  .default('goal')
  .transform((mode): AgentMode => mode)

const ChatAttachmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    mediaType: z.string().min(1),
    name: z.string().optional(),
    dataUrl: z.string().min(1),
  }),
  z.object({
    kind: z.literal('file'),
    mediaType: z.string().min(1),
    name: z.string().min(1),
    text: z.string(),
  }),
])

const ChatApprovalPolicySchema = z
  .object({
    mode: z.enum(['supervised', 'full_browser']),
    scope: z.literal('goal_run'),
  })
  .optional()

const ChatAgentStrategySchema = z
  .object({
    mode: z.enum(['auto', 'single', 'parallel']),
    maxWorkers: z.number().int().positive().max(16).optional(),
  })
  .optional()

export const ChatRequestSchema = AgentLLMConfigSchema.extend({
  conversationId: z.string().uuid(),
  message: z.string().optional().default(''),
  approvalResponses: z
    .array(
      z.object({
        id: z.string(),
        approved: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
  contextWindowSize: z.number().optional(),
  browserContext: BrowserContextSchema.optional(),
  userSystemPrompt: z.string().optional(),
  isScheduledTask: z.boolean().optional().default(false),
  userWorkingDir: z.string().min(1).optional(),
  supportsImages: z.boolean().optional().default(true),
  mode: ChatRequestModeSchema,
  origin: z.enum(['sidepanel', 'newtab']).optional().default('sidepanel'),
  declinedApps: z.array(z.string()).optional(),
  selectedText: z.string().optional(),
  selectedTextSource: z
    .object({
      url: z.string(),
      title: z.string(),
    })
    .optional(),
  approvalPolicy: ChatApprovalPolicySchema,
  agentStrategy: ChatAgentStrategySchema,
  attachments: z.array(ChatAttachmentSchema).max(10).optional(),
  previousConversation: z
    .union([
      z.array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        }),
      ),
      z.string(),
    ])
    .optional()
    .transform((val) => {
      if (typeof val !== 'string') return val
      if (!val.trim()) return undefined
      return [{ role: 'user' as const, content: val }]
    }),
})

export type ChatRequest = z.infer<typeof ChatRequestSchema>

/**
 * Hono environment bindings for Bun.serve integration.
 */
export type Env = {
  Bindings: {
    server: ReturnType<typeof Bun.serve>
  }
}

/**
 * Configuration for the consolidated HTTP server.
 * This server handles all routes: health, klavis, chat, mcp, provider
 */
export interface HttpServerConfig {
  port: number
  host?: string

  version: string
  browser: Browser
  registry: ToolRegistry

  browserosId?: string
  storageRoot: string
  executionDir: string
  outputsDir: string
  resourcesDir: string
  codegenServiceUrl?: string
  aiSdkDevtoolsEnabled?: boolean

  onShutdown?: () => void
}
