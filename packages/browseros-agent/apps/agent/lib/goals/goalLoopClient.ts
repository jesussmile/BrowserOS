import { getAgentServerUrl } from '../browseros/helpers'

const DEFAULT_TIMEOUT_MS = 30_000
const RUN_TIMEOUT_MS = 300_000

export type GoalLoopStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'blocked'

export type GoalLoopLifecycleStatus =
  | 'running'
  | 'compacting'
  | 'resuming'
  | 'paused'
  | 'blocked'
  | 'complete'
  | 'cancelled'
  | 'error'

export type GoalLoopContinuationReason =
  | 'pre_turn_limit'
  | 'restart_resume'
  | 'watchdog'
  | 'manual_resume'
  | 'ui_auto_continue'
  | 'yield'

export type GoalLoopQueueStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'blocked'

export type GoalLoopAction =
  | 'read'
  | 'navigate'
  | 'click'
  | 'scroll'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'download'
  | 'extract'
  | 'verify'
  | 'write'
  | 'login'
  | 'credential'
  | 'purchase'
  | 'upload'
  | 'delete'
  | 'account_change'
  | 'billing_change'
  | 'security_change'
  | 'public_post'
  | 'message'
  | 'custom'

export interface GoalLoopApprovalPolicy {
  mode: 'supervised' | 'full_browser'
  scope: 'goal_run'
}

export interface GoalLoopAgentStrategy {
  mode: 'auto' | 'single' | 'parallel'
  maxWorkers?: number
}

export interface GoalLoopQueueMetadata {
  action?: GoalLoopAction
  risk?: 'low' | 'high'
  description?: string
  approvalRequired?: boolean
  approvalGranted?: boolean
  approvedAt?: number
  approvalReason?: string
  requiresQueueExpansion?: boolean
  expansionReason?: string
  url?: string
  pageId?: number
  selector?: string
  element?: number
  text?: string
  value?: string
  clear?: boolean
  waitForText?: string
  waitForSelector?: string
  scrollDirection?: 'up' | 'down' | 'left' | 'right'
  scrollAmount?: number
  downloadMode?: 'pdf' | 'click' | 'url'
  outputPath?: string
  filename?: string
  sourceKind?:
    | 'ourairports-countries'
    | 'ourairports-airports'
    | 'ourairports-country'
  queueExpansion?: 'ourairports-countries'
  countryCode?: string
  countryName?: string
}

export interface GoalLoopQueueItem {
  id: string
  goalRunId: string
  orderIndex: number
  title: string
  status: GoalLoopQueueStatus
  attempts: number
  maxAttempts: number
  sourceUrl?: string
  artifactPath?: string
  metadata?: GoalLoopQueueMetadata
  evidence?: unknown
  error?: string
}

export interface GoalLoopGoal {
  id: string
  sessionId?: string
  prompt: string
  status: GoalLoopStatus
  queue: GoalLoopQueueItem[]
}

export interface GoalLoopManifestItem {
  id: string
  title: string
  status: GoalLoopQueueStatus
  attempts: number
  maxAttempts: number
  sourceUrl?: string
  artifactPath?: string
  evidence?: unknown
  error?: string
}

export interface GoalLoopManifest {
  goalRunId: string
  prompt: string
  status: GoalLoopStatus
  generatedAt: number
  completionCriteria: string[]
  totals: {
    completed: number
    skipped: number
    failed: number
    blocked: number
    pending: number
  }
  completed: GoalLoopManifestItem[]
  skipped: GoalLoopManifestItem[]
  failed: GoalLoopManifestItem[]
  blocked: GoalLoopManifestItem[]
  pending: GoalLoopManifestItem[]
}

export interface GoalLoopCheckpointSummary {
  id: string
  type: string
  summary: string
  createdAt: number
}

export interface GoalLoopContinuationPacket {
  version: 1
  goalRunId: string
  generatedAt: number
  reason: GoalLoopContinuationReason
  objective: string
  constraints: string[]
  approvalScope: {
    autoApprove: GoalLoopAction[]
    pauseFor: GoalLoopAction[]
  }
  queueCounts: GoalLoopProgress['queueCounts']
  currentItem?: GoalLoopManifestItem
  lastCheckpoint?: GoalLoopCheckpointSummary
  completedItems: GoalLoopManifestItem[]
  pendingItems: GoalLoopManifestItem[]
  blockedItems: GoalLoopManifestItem[]
  failedItems: GoalLoopManifestItem[]
  artifacts: Array<{
    itemId: string
    title: string
    path: string
    sourceUrl?: string
  }>
  nextAction: string
  resumePrompt: string
}

export interface GoalLoopProgress {
  goalRunId: string
  status: GoalLoopStatus
  lifecycleStatus?: GoalLoopLifecycleStatus
  prompt: string
  queueCounts: {
    pending: number
    running: number
    completed: number
    skipped: number
    failed: number
    blocked: number
  }
  currentItem?: GoalLoopManifestItem
  pauseReason?: string
  retryCount: number
  lastCheckpoint?: GoalLoopCheckpointSummary
  continuation?: {
    count: number
    lastCompactedAt?: number
    packet?: GoalLoopContinuationPacket
  }
  resumePrompt?: string
  approvalPolicy?: GoalLoopApprovalPolicy
  agentStrategy?: GoalLoopAgentStrategy
  workerStatus?: {
    mode: GoalLoopAgentStrategy['mode']
    maxWorkers: number
    activeWorkers: number
  }
  lockStatus?: {
    browserMutationLocked: boolean
    lockedByItemId?: string
  }
  manifest?: GoalLoopManifest
}

export interface GoalLoopRunResult {
  goal: GoalLoopGoal
  status:
    | 'completed'
    | 'paused_for_approval'
    | 'running'
    | 'cancelled'
    | 'not_found'
  processedItems: number
  manifest?: GoalLoopManifest
  continuationPacket?: GoalLoopContinuationPacket
  background?: {
    started: boolean
    alreadyRunning?: boolean
  }
  approval?: {
    required: boolean
    action: GoalLoopAction
    reason?: string
  }
}

export interface CreateGoalLoopInput {
  sessionId?: string
  prompt: string
  startImmediately?: boolean
  approvalPolicy?: GoalLoopApprovalPolicy
  agentStrategy?: GoalLoopAgentStrategy
  queueItems?: Array<{
    title: string
    sourceUrl?: string
    metadata?: GoalLoopQueueMetadata
  }>
}

async function requestLocal<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  try {
    const baseUrl = await getAgentServerUrl()
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function planGoalLoop(
  input: CreateGoalLoopInput,
): Promise<GoalLoopGoal | null> {
  const response = await requestLocal<{ goal: GoalLoopGoal }>(
    '/local/goals/plan',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return response?.goal ?? null
}

export async function runGoalLoop(
  goalId: string,
  options: {
    maxItems?: number
    resumeReason?: GoalLoopContinuationReason
    background?: boolean
  } = {},
): Promise<GoalLoopRunResult | null> {
  const response = await requestLocal<{ run: GoalLoopRunResult }>(
    `/local/goals/${encodeURIComponent(goalId)}/run`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
    options.background ? DEFAULT_TIMEOUT_MS : RUN_TIMEOUT_MS,
  )
  return response?.run ?? null
}

export async function getGoalLoopProgress(
  goalId: string,
): Promise<GoalLoopProgress | null> {
  const response = await requestLocal<{ progress: GoalLoopProgress }>(
    `/local/goals/${encodeURIComponent(goalId)}/progress`,
  )
  return response?.progress ?? null
}

export async function resumeUnfinishedGoalLoops(
  options: {
    maxItems?: number
    resumeReason?: GoalLoopContinuationReason
  } = {},
): Promise<GoalLoopRunResult[]> {
  const response = await requestLocal<{
    runs: GoalLoopRunResult[]
    count: number
  }>(
    '/local/goals/resume-unfinished',
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
    RUN_TIMEOUT_MS,
  )
  return response?.runs ?? []
}

export async function pauseGoalLoop(
  goalId: string,
): Promise<GoalLoopGoal | null> {
  const response = await requestLocal<{ goal: GoalLoopGoal }>(
    `/local/goals/${encodeURIComponent(goalId)}/pause`,
    { method: 'POST' },
  )
  return response?.goal ?? null
}

export async function resumeGoalLoopStatus(
  goalId: string,
  options: { grantBlockedApproval?: boolean } = { grantBlockedApproval: true },
): Promise<GoalLoopGoal | null> {
  const response = await requestLocal<{ goal: GoalLoopGoal }>(
    `/local/goals/${encodeURIComponent(goalId)}/resume`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
  )
  return response?.goal ?? null
}

export async function compactGoalLoop(
  goalId: string,
  options: { reason?: GoalLoopContinuationReason } = {},
): Promise<{
  packet: GoalLoopContinuationPacket
  progress?: GoalLoopProgress | null
} | null> {
  return requestLocal(`/local/goals/${encodeURIComponent(goalId)}/compact`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function cancelGoalLoop(
  goalId: string,
): Promise<GoalLoopGoal | null> {
  const response = await requestLocal<{ goal: GoalLoopGoal }>(
    `/local/goals/${encodeURIComponent(goalId)}/cancel`,
    { method: 'POST' },
  )
  return response?.goal ?? null
}
