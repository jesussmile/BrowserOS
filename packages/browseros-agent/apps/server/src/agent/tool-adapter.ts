import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider'
import { type ToolSet, tool } from 'ai'
import { LocalSessionService } from '../api/services/local-session-service'
import { logger } from '../lib/logger'
import { metrics } from '../lib/metrics'
import { executeTool, type ToolContext } from '../tools/framework'
import type { ContentItem } from '../tools/response'
import type { ToolRegistry } from '../tools/tool-registry'
import { getSupervisedApprovalDecision } from './tool-risk'

function inputKeys(params: unknown): string[] {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return []
  return Object.keys(params).sort()
}

function recordBrowserToolAudit(options: {
  ctx: ToolContext
  toolName: string
  success: boolean
  durationMs: number
  params: unknown
  errorMessage?: string
}) {
  const sessionId = options.ctx.session?.conversationId
  if (!sessionId) return

  try {
    new LocalSessionService().recordAuditEvent({
      sessionId,
      type: options.success ? 'tool.browser.succeeded' : 'tool.browser.failed',
      summary: `Browser tool ${options.toolName} ${
        options.success ? 'completed' : 'failed'
      }`,
      payload: {
        toolName: options.toolName,
        durationMs: options.durationMs,
        success: options.success,
        inputKeys: inputKeys(options.params),
        ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
      },
    })
  } catch (error) {
    logger.warn('Failed to record browser tool audit event', {
      tool: options.toolName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function recordBrowserToolApprovalRequired(options: {
  ctx: ToolContext
  toolName: string
  reason?: string
  params: unknown
}) {
  const sessionId = options.ctx.session?.conversationId
  if (!sessionId) return

  try {
    new LocalSessionService().recordAuditEvent({
      sessionId,
      type: 'tool.browser.approval_required',
      summary: `Browser tool ${options.toolName} requires approval`,
      payload: {
        toolName: options.toolName,
        reason: options.reason,
        inputKeys: inputKeys(options.params),
      },
    })
  } catch (error) {
    logger.warn('Failed to record browser tool approval audit event', {
      tool: options.toolName,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function contentToModelOutput(
  content: ContentItem[],
): LanguageModelV2ToolResultOutput {
  const hasImages = content.some((c) => c.type === 'image')

  if (!hasImages) {
    const text = content
      .filter((c): c is ContentItem & { type: 'text' } => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
    return { type: 'text', value: text || 'Success' }
  }

  return {
    type: 'content',
    value: content.map((c) => {
      if (c.type === 'text') {
        return { type: 'text' as const, text: c.text }
      }
      return {
        type: 'media' as const,
        data: c.data,
        mediaType: c.mimeType,
      }
    }),
  }
}

export function buildBrowserToolSet(
  registry: ToolRegistry,
  ctx: ToolContext,
): ToolSet {
  const toolSet: ToolSet = {}

  for (const def of registry.all()) {
    toolSet[def.name] = tool({
      description: def.description,
      inputSchema: def.input,
      needsApproval: async (params) => {
        const approval = await getSupervisedApprovalDecision(
          def.name,
          params,
          ctx,
        )
        if (approval.required) {
          recordBrowserToolApprovalRequired({
            ctx,
            toolName: def.name,
            reason: approval.reason,
            params,
          })
        }
        return approval.required
      },
      execute: async (params) => {
        const startTime = performance.now()
        try {
          const result = await executeTool(
            def,
            params,
            ctx,
            AbortSignal.timeout(120_000),
          )
          const durationMs = Math.round(performance.now() - startTime)

          metrics.log('tool_executed', {
            tool_name: def.name,
            duration_ms: durationMs,
            success: !result.isError,
            source: 'chat',
          })
          recordBrowserToolAudit({
            ctx,
            toolName: def.name,
            success: !result.isError,
            durationMs,
            params,
          })

          return {
            content: result.content,
            isError: result.isError ?? false,
            metadata: result.metadata,
          }
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error)

          logger.error('Tool execution failed', {
            tool: def.name,
            error: errorText,
          })
          const durationMs = Math.round(performance.now() - startTime)
          metrics.log('tool_executed', {
            tool_name: def.name,
            duration_ms: durationMs,
            success: false,
            error_message:
              error instanceof Error ? error.message : 'Unknown error',
            source: 'chat',
          })
          recordBrowserToolAudit({
            ctx,
            toolName: def.name,
            success: false,
            durationMs,
            params,
            errorMessage: errorText,
          })

          return {
            content: [{ type: 'text' as const, text: errorText }],
            isError: true,
          }
        }
      },
      toModelOutput: ({ output }) => {
        const result = output as {
          content: ContentItem[]
          isError: boolean
        }
        if (result.isError) {
          const text = result.content
            .filter(
              (c): c is ContentItem & { type: 'text' } => c.type === 'text',
            )
            .map((c) => c.text)
            .join('\n')
          return { type: 'error-text', value: text }
        }
        if (!result.content?.length) {
          return { type: 'text', value: 'Success' }
        }
        return contentToModelOutput(result.content)
      },
    })
  }

  return toolSet
}
