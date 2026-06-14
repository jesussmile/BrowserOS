/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  isLoopbackHttpUrl,
  LOCAL_MCP_URL_ERROR,
} from '@browseros/shared/utils/local-url'
import { zValidator } from '@hono/zod-validator'
import type { UIMessage } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import { RUNTIME_SKILL_DESCRIPTORS } from '../../lib/agents/acpx-runtime-templates'
import { AGENT_ADAPTER_CATALOG } from '../../lib/agents/agent-catalog'
import { listLocalAgentRoleTemplates } from '../../lib/agents/agent-role-bootstrap'
import { discoverRepoRuntimeSkills } from '../../lib/agents/repo-runtime-skills'
import { OAUTH_MCP_SERVERS } from '../../lib/clients/klavis/oauth-mcp-servers'
import {
  type GoalLoopAction,
  type GoalLoopAgentStrategy,
  type GoalLoopApprovalPolicy,
  type GoalLoopItemExecutor,
  type GoalLoopQueueMetadata,
  GoalLoopService,
} from '../services/goal-loop-service'
import {
  type LocalGoalQueueStatus,
  type LocalGoalStatus,
  LocalSessionService,
  type LocalSessionStatus,
} from '../services/local-session-service'

export interface McpToolPreview {
  name: string
  description?: string
}

const SessionIdParamSchema = z.object({
  sessionId: z.string().min(1),
})

const GoalIdParamSchema = z.object({
  goalId: z.string().min(1),
})

const GoalQueueItemIdParamSchema = z.object({
  goalId: z.string().min(1),
  itemId: z.string().min(1),
})

const LocalAppSchema = z.object({
  serverName: z.string().min(1),
  localConnectorUrl: z
    .string()
    .url()
    .refine(isLoopbackHttpUrl, LOCAL_MCP_URL_ERROR)
    .optional(),
  localConnectorDescription: z.string().optional(),
})

const LocalConnectorCheckSchema = z.object({
  url: z.string().url().refine(isLoopbackHttpUrl, LOCAL_MCP_URL_ERROR),
})

const LocalSessionStatusSchema = z.enum(['active', 'archived'])
const LocalGoalStatusSchema = z.enum([
  'running',
  'paused',
  'completed',
  'cancelled',
  'blocked',
])
const LocalGoalQueueStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'skipped',
  'failed',
  'blocked',
])
const GoalLoopActionSchema = z.enum([
  'read',
  'navigate',
  'click',
  'scroll',
  'fill',
  'select',
  'check',
  'uncheck',
  'download',
  'extract',
  'verify',
  'write',
  'login',
  'credential',
  'purchase',
  'upload',
  'delete',
  'account_change',
  'billing_change',
  'security_change',
  'public_post',
  'message',
  'custom',
])
const GoalLoopContinuationReasonSchema = z.enum([
  'pre_turn_limit',
  'restart_resume',
  'watchdog',
  'manual_resume',
  'ui_auto_continue',
  'yield',
])

const GoalLoopApprovalPolicySchema = z.object({
  mode: z.enum(['supervised', 'full_browser']),
  scope: z.literal('goal_run'),
})

const GoalLoopAgentStrategySchema = z.object({
  mode: z.enum(['auto', 'single', 'parallel']),
  maxWorkers: z.number().int().positive().max(16).optional(),
})

const GoalLoopQueueMetadataSchema = z.object({
  action: GoalLoopActionSchema.optional(),
  risk: z.enum(['low', 'high']).optional(),
  description: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvalGranted: z.boolean().optional(),
  approvedAt: z.number().optional(),
  approvalReason: z.string().optional(),
  requiresQueueExpansion: z.boolean().optional(),
  expansionReason: z.string().optional(),
  url: z.string().optional(),
  pageId: z.number().optional(),
  selector: z.string().optional(),
  element: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  clear: z.boolean().optional(),
  waitForText: z.string().optional(),
  waitForSelector: z.string().optional(),
  timeoutMs: z.number().positive().optional(),
  scrollDirection: z.enum(['up', 'down', 'left', 'right']).optional(),
  scrollAmount: z.number().positive().optional(),
  downloadMode: z.enum(['pdf', 'click', 'url']).optional(),
  outputPath: z.string().optional(),
  filename: z.string().optional(),
  sourceKind: z
    .enum([
      'ourairports-countries',
      'ourairports-airports',
      'ourairports-country',
    ])
    .optional(),
  queueExpansion: z.enum(['ourairports-countries']).optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
})

const GoalLoopApprovalScopeSchema = z.object({
  autoApprove: z.array(GoalLoopActionSchema).optional(),
  pauseFor: z.array(GoalLoopActionSchema).optional(),
})

const UpsertSessionSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  status: LocalSessionStatusSchema.optional(),
  messages: z.array(z.unknown()).optional(),
  lastMessagedAt: z.number().optional(),
  metadata: z.unknown().optional(),
})

const AppendMessagesSchema = z
  .object({
    message: z.unknown().optional(),
    messages: z.array(z.unknown()).optional(),
  })
  .refine((body) => body.message !== undefined || body.messages !== undefined, {
    message: 'message or messages is required',
  })

const CreateGoalSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().optional(),
  prompt: z.string().trim().min(1),
  status: LocalGoalStatusSchema.optional(),
  metadata: z.unknown().optional(),
  queueItems: z
    .array(
      z.object({
        id: z.string().optional(),
        orderIndex: z.number().int().nonnegative().optional(),
        title: z.string().trim().min(1),
        status: LocalGoalQueueStatusSchema.optional(),
        attempts: z.number().int().nonnegative().optional(),
        maxAttempts: z.number().int().positive().optional(),
        sourceUrl: z.string().optional(),
        artifactPath: z.string().optional(),
        metadata: z.unknown().optional(),
        evidence: z.unknown().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
})

const CreateGoalLoopSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().optional(),
  prompt: z.string().trim().min(1),
  completionCriteria: z.array(z.string().trim().min(1)).optional(),
  approvalScope: GoalLoopApprovalScopeSchema.optional(),
  approvalPolicy: GoalLoopApprovalPolicySchema.optional(),
  agentStrategy: GoalLoopAgentStrategySchema.optional(),
  retryLimit: z.number().int().positive().optional(),
  startImmediately: z.boolean().optional(),
  queueItems: z
    .array(
      z.object({
        id: z.string().optional(),
        orderIndex: z.number().int().nonnegative().optional(),
        title: z.string().trim().min(1),
        status: LocalGoalQueueStatusSchema.optional(),
        attempts: z.number().int().nonnegative().optional(),
        maxAttempts: z.number().int().positive().optional(),
        sourceUrl: z.string().optional(),
        artifactPath: z.string().optional(),
        metadata: GoalLoopQueueMetadataSchema.optional(),
        evidence: z.unknown().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
})

const RunGoalLoopSchema = z.object({
  maxItems: z.number().int().positive().optional(),
  resumeReason: GoalLoopContinuationReasonSchema.optional(),
  background: z.boolean().optional(),
})

const ResumeGoalLoopSchema = z.object({
  grantBlockedApproval: z.boolean().optional(),
})

const CompactGoalLoopSchema = z.object({
  reason: GoalLoopContinuationReasonSchema.optional(),
})

const UpsertGoalQueueItemSchema = z.object({
  id: z.string().optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1),
  status: LocalGoalQueueStatusSchema.optional(),
  attempts: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().optional(),
  sourceUrl: z.string().optional(),
  artifactPath: z.string().optional(),
  metadata: z.unknown().optional(),
  evidence: z.unknown().optional(),
  error: z.string().optional(),
})

const UpdateGoalQueueItemSchema = z.object({
  status: LocalGoalQueueStatusSchema.optional(),
  attempts: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().optional(),
  sourceUrl: z.string().nullable().optional(),
  artifactPath: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  evidence: z.unknown().optional(),
  error: z.string().nullable().optional(),
})

const GoalCheckpointSchema = z.object({
  id: z.string().optional(),
  type: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  state: z.unknown().optional(),
})

const AuditEventSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().optional(),
  goalRunId: z.string().optional(),
  type: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  payload: z.unknown().optional(),
})

interface LocalRoutesDeps {
  service?: LocalSessionService
  goalLoop?: GoalLoopService
  goalLoopExecutor?: GoalLoopItemExecutor
  inspectMcpConnector?: (url: string) => Promise<McpToolPreview[]>
}

export function createLocalRoutes(deps: LocalRoutesDeps = {}) {
  const service = deps.service ?? new LocalSessionService()
  const goalLoop =
    deps.goalLoop ??
    new GoalLoopService({
      service,
      executor: deps.goalLoopExecutor,
    })
  const inspectMcpConnector =
    deps.inspectMcpConnector ?? defaultInspectMcpConnector

  return new Hono()
    .get('/agent-capabilities', async (c) => {
      const skills = await listLocalRuntimeSkillDescriptors()
      return c.json({
        adapters: AGENT_ADAPTER_CATALOG,
        skills,
        roles: listLocalAgentRoleTemplates(),
        localFirst: true,
        cloud: {
          browserosLoginRequired: false,
          browserosCloudSync: false,
          managedAppAuth: false,
        },
      })
    })
    .get('/agent-skills', async (c) => {
      const skills = await listLocalRuntimeSkillDescriptors()
      return c.json({
        skills,
        count: skills.length,
      })
    })
    .get('/agent-roles', (c) => {
      const roles = listLocalAgentRoleTemplates()
      return c.json({
        roles,
        count: roles.length,
      })
    })
    .get('/apps/catalog', (c) => {
      return c.json({
        servers: OAUTH_MCP_SERVERS.map((server) => ({
          ...server,
          connectionMode: 'local_catalog',
        })),
        count: OAUTH_MCP_SERVERS.length,
      })
    })
    .get('/apps/integrations', (c) => {
      return c.json({
        integrations: OAUTH_MCP_SERVERS.map((server) => ({
          name: server.name,
          is_authenticated: false,
          connection_mode: 'local_catalog',
        })),
        count: OAUTH_MCP_SERVERS.length,
      })
    })
    .post('/apps/add', zValidator('json', LocalAppSchema), (c) => {
      const { serverName, localConnectorUrl, localConnectorDescription } =
        c.req.valid('json')
      const server = OAUTH_MCP_SERVERS.find(
        (entry) => entry.name === serverName,
      )
      if (!server) return c.json({ error: `Invalid app: ${serverName}` }, 400)

      return c.json({
        success: true,
        serverName,
        strataId: 'local-catalog',
        addedServers: [serverName],
        connectionMode: 'local_catalog',
        localConnector: localConnectorUrl
          ? {
              url: localConnectorUrl,
              description: localConnectorDescription ?? server.description,
            }
          : undefined,
      })
    })
    .delete('/apps/remove', zValidator('json', LocalAppSchema), (c) => {
      const { serverName } = c.req.valid('json')
      const server = OAUTH_MCP_SERVERS.find(
        (entry) => entry.name === serverName,
      )
      if (!server) return c.json({ error: `Invalid app: ${serverName}` }, 400)

      return c.json({
        success: true,
        serverName,
        connectionMode: 'local_catalog',
      })
    })
    .post('/apps/submit-api-key', (c) => {
      return c.json(
        {
          error:
            'Upstream managed app API-key submission is disabled in this private local-first build. Add a custom local MCP server instead.',
        },
        400,
      )
    })
    .post(
      '/apps/check-connector',
      zValidator('json', LocalConnectorCheckSchema),
      async (c) => {
        const { url } = c.req.valid('json')
        try {
          const tools = await inspectMcpConnector(url)
          return c.json({
            ok: true,
            url,
            toolCount: tools.length,
            tools,
          })
        } catch (error) {
          return c.json({
            ok: false,
            url,
            toolCount: 0,
            tools: [],
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    )
    .get('/sessions', (c) => {
      return c.json({ sessions: service.listSessions() })
    })
    .post('/sessions', zValidator('json', UpsertSessionSchema), (c) => {
      const body = c.req.valid('json')
      const session = service.upsertSession({
        ...body,
        status: body.status as LocalSessionStatus | undefined,
        messages: body.messages as UIMessage[] | undefined,
      })
      return c.json({ session }, 201)
    })
    .get(
      '/sessions/:sessionId',
      zValidator('param', SessionIdParamSchema),
      (c) => {
        const { sessionId } = c.req.valid('param')
        const session = service.getSession(sessionId)
        if (!session) return c.json({ error: 'Session not found' }, 404)
        return c.json({ session })
      },
    )
    .patch(
      '/sessions/:sessionId',
      zValidator('param', SessionIdParamSchema),
      zValidator('json', UpsertSessionSchema.omit({ id: true })),
      (c) => {
        const { sessionId } = c.req.valid('param')
        const body = c.req.valid('json')
        const session = service.upsertSession({
          ...body,
          id: sessionId,
          status: body.status as LocalSessionStatus | undefined,
          messages: body.messages as UIMessage[] | undefined,
        })
        return c.json({ session })
      },
    )
    .delete(
      '/sessions/:sessionId',
      zValidator('param', SessionIdParamSchema),
      (c) => {
        const { sessionId } = c.req.valid('param')
        const deleted = service.deleteSession(sessionId)
        return c.json({ success: deleted }, deleted ? 200 : 404)
      },
    )
    .post(
      '/sessions/:sessionId/messages',
      zValidator('param', SessionIdParamSchema),
      zValidator('json', AppendMessagesSchema),
      (c) => {
        const { sessionId } = c.req.valid('param')
        const body = c.req.valid('json')
        const messages = [
          ...(body.message === undefined ? [] : [body.message]),
          ...(body.messages ?? []),
        ] as UIMessage[]
        const session = service.appendMessages(sessionId, messages)
        return c.json({ session })
      },
    )
    .post(
      '/sessions/:sessionId/compact',
      zValidator('param', SessionIdParamSchema),
      (c) => {
        const { sessionId } = c.req.valid('param')
        const session = service.getSession(sessionId)
        if (!session) return c.json({ error: 'Session not found' }, 404)

        const compaction = compactSessionMessages(session.messages)
        const metadata = {
          ...(asObject(session.metadata) ?? {}),
          chatCompaction: compaction,
        }
        const updated = service.upsertSession({
          id: session.id,
          title: session.title,
          status: session.status,
          messages: session.messages,
          lastMessagedAt: session.lastMessagedAt,
          metadata,
        })
        service.recordAuditEvent({
          sessionId,
          type: 'chat.compacted',
          summary: 'Chat conversation compacted locally.',
          payload: compaction,
        })

        return c.json({ session: updated, compaction })
      },
    )
    .get(
      '/sessions/:sessionId/audit',
      zValidator('param', SessionIdParamSchema),
      (c) => {
        const { sessionId } = c.req.valid('param')
        return c.json({ events: service.getAuditEvents(sessionId) })
      },
    )
    .post('/audit', zValidator('json', AuditEventSchema), (c) => {
      const event = service.recordAuditEvent(c.req.valid('json'))
      return c.json({ event }, 201)
    })
    .post('/goals', zValidator('json', CreateGoalSchema), (c) => {
      const body = c.req.valid('json')
      const goal = service.createGoal({
        ...body,
        status: body.status as LocalGoalStatus | undefined,
        queueItems: body.queueItems?.map((item) => ({
          ...item,
          status: item.status as LocalGoalQueueStatus | undefined,
        })),
      })
      return c.json({ goal }, 201)
    })
    .post(
      '/goals/plan',
      zValidator('json', CreateGoalLoopSchema),
      async (c) => {
        const body = c.req.valid('json')
        const goal = goalLoop.createGoal({
          ...body,
          approvalPolicy: body.approvalPolicy as
            | GoalLoopApprovalPolicy
            | undefined,
          agentStrategy: body.agentStrategy as
            | GoalLoopAgentStrategy
            | undefined,
          approvalScope: body.approvalScope
            ? {
                autoApprove: body.approvalScope.autoApprove as
                  | GoalLoopAction[]
                  | undefined,
                pauseFor: body.approvalScope.pauseFor as
                  | GoalLoopAction[]
                  | undefined,
              }
            : undefined,
          queueItems: body.queueItems?.map((item) => ({
            ...item,
            status: item.status as LocalGoalQueueStatus | undefined,
            metadata: item.metadata as GoalLoopQueueMetadata | undefined,
          })),
        })
        if (!body.startImmediately) return c.json({ goal }, 201)
        const run = await goalLoop.runGoal(goal.id)
        return c.json({ goal: run.goal, run }, 201)
      },
    )
    .post(
      '/goals/resume-unfinished',
      zValidator('json', RunGoalLoopSchema),
      async (c) => {
        const body = c.req.valid('json')
        const runs = await goalLoop.resumeUnfinishedGoals({
          maxItems: body.maxItems,
          resumeReason: body.resumeReason ?? 'manual_resume',
        })
        return c.json({ runs, count: runs.length })
      },
    )
    .get('/goals/:goalId', zValidator('param', GoalIdParamSchema), (c) => {
      const { goalId } = c.req.valid('param')
      const goal = service.getGoal(goalId)
      if (!goal) return c.json({ error: 'Goal not found' }, 404)
      return c.json({ goal })
    })
    .get(
      '/goals/:goalId/manifest',
      zValidator('param', GoalIdParamSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        try {
          return c.json({ manifest: goalLoop.generateManifest(goalId) })
        } catch {
          return c.json({ error: 'Goal not found' }, 404)
        }
      },
    )
    .get(
      '/goals/:goalId/progress',
      zValidator('param', GoalIdParamSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        const progress = goalLoop.getProgress(goalId)
        if (!progress) return c.json({ error: 'Goal not found' }, 404)
        return c.json({ progress })
      },
    )
    .get(
      '/goals/:goalId/queue',
      zValidator('param', GoalIdParamSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        if (!service.getGoal(goalId))
          return c.json({ error: 'Goal not found' }, 404)
        return c.json({ queue: service.listGoalQueueItems(goalId) })
      },
    )
    .post(
      '/goals/:goalId/queue',
      zValidator('param', GoalIdParamSchema),
      zValidator('json', UpsertGoalQueueItemSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        if (!service.getGoal(goalId)) {
          return c.json({ error: 'Goal not found' }, 404)
        }
        const body = c.req.valid('json')
        const item = service.upsertGoalQueueItem({
          ...body,
          goalRunId: goalId,
          status: body.status as LocalGoalQueueStatus | undefined,
        })
        return c.json({ item }, 201)
      },
    )
    .patch(
      '/goals/:goalId/queue/:itemId',
      zValidator('param', GoalQueueItemIdParamSchema),
      zValidator('json', UpdateGoalQueueItemSchema),
      (c) => {
        const { goalId, itemId } = c.req.valid('param')
        const body = c.req.valid('json')
        const item = service.updateGoalQueueItem(goalId, itemId, {
          ...body,
          status: body.status as LocalGoalQueueStatus | undefined,
        })
        if (!item) return c.json({ error: 'Queue item not found' }, 404)
        return c.json({ item })
      },
    )
    .post(
      '/goals/:goalId/checkpoints',
      zValidator('param', GoalIdParamSchema),
      zValidator('json', GoalCheckpointSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        if (!service.getGoal(goalId)) {
          return c.json({ error: 'Goal not found' }, 404)
        }
        const checkpoint = service.recordGoalCheckpoint({
          ...c.req.valid('json'),
          goalRunId: goalId,
        })
        return c.json({ checkpoint }, 201)
      },
    )
    .post(
      '/goals/:goalId/run',
      zValidator('param', GoalIdParamSchema),
      zValidator('json', RunGoalLoopSchema),
      async (c) => {
        const { goalId } = c.req.valid('param')
        const body = c.req.valid('json')
        const runOptions = {
          maxItems: body.maxItems,
          resumeReason:
            body.resumeReason ??
            (body.maxItems ? 'ui_auto_continue' : undefined),
        }
        const run = body.background
          ? goalLoop.startBackgroundRun(goalId, runOptions)
          : await goalLoop.runGoal(goalId, runOptions)
        if (run.status === 'not_found') {
          return c.json({ error: 'Goal not found' }, 404)
        }
        return c.json({ run, progress: goalLoop.getProgress(goalId) })
      },
    )
    .post(
      '/goals/:goalId/compact',
      zValidator('param', GoalIdParamSchema),
      async (c) => {
        const { goalId } = c.req.valid('param')
        const body = CompactGoalLoopSchema.parse(
          await c.req.json().catch(() => ({})),
        )
        const packet = goalLoop.compactGoal(
          goalId,
          body.reason ?? 'manual_resume',
        )
        if (!packet) return c.json({ error: 'Goal not found' }, 404)
        const progress = goalLoop.getProgress(goalId)
        return c.json({ packet, progress })
      },
    )
    .post(
      '/goals/:goalId/resume',
      zValidator('param', GoalIdParamSchema),
      async (c) => {
        const { goalId } = c.req.valid('param')
        const body = ResumeGoalLoopSchema.parse(
          await c.req.json().catch(() => ({})),
        )
        const goal = goalLoop.markResuming(goalId, 'manual_resume', {
          grantBlockedApproval: body.grantBlockedApproval ?? true,
        })
        if (!goal) return c.json({ error: 'Goal not found' }, 404)
        return c.json({ goal })
      },
    )
    .post(
      '/goals/:goalId/pause',
      zValidator('param', GoalIdParamSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        const goal = service.updateGoalStatus(goalId, 'paused')
        if (!goal) return c.json({ error: 'Goal not found' }, 404)
        return c.json({ goal })
      },
    )
    .post(
      '/goals/:goalId/cancel',
      zValidator('param', GoalIdParamSchema),
      (c) => {
        const { goalId } = c.req.valid('param')
        const goal = service.updateGoalStatus(goalId, 'cancelled')
        if (!goal) return c.json({ error: 'Goal not found' }, 404)
        return c.json({ goal })
      },
    )
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function compactSessionMessages(messages: UIMessage[]) {
  const messageTexts = messages
    .map((message) => ({
      role: message.role,
      text: message.parts
        ?.filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim(),
    }))
    .filter((message) => message.text)

  const recent = messageTexts.slice(-12)
  const earlier = messageTexts.slice(0, -12)
  const earlierSummary =
    earlier.length > 0
      ? earlier
          .slice(0, 24)
          .map((message) => `${message.role}: ${message.text.slice(0, 280)}`)
          .join('\n')
      : 'No earlier messages before the retained recent window.'

  return {
    compactedAt: Date.now(),
    messageCount: messages.length,
    retainedRecentCount: recent.length,
    summary: earlierSummary,
    recentMessages: recent,
  }
}

async function defaultInspectMcpConnector(
  url: string,
): Promise<McpToolPreview[]> {
  const { inspectMcpServerTools } = await import('../../lib/mcp-inspector')
  return inspectMcpServerTools(url)
}

async function listLocalRuntimeSkillDescriptors() {
  const builtInIds = new Set(RUNTIME_SKILL_DESCRIPTORS.map((skill) => skill.id))
  const repoSkills = (await discoverRepoRuntimeSkills()).filter(
    (skill) => !builtInIds.has(skill.id),
  )
  return [
    ...RUNTIME_SKILL_DESCRIPTORS,
    ...repoSkills.map(({ id, name, description, source }) => ({
      id,
      name,
      description,
      source,
    })),
  ]
}
