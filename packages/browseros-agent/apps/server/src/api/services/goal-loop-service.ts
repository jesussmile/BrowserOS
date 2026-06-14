/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  type GoalQueueItemInput,
  type LocalGoalCheckpoint,
  type LocalGoalQueueItem,
  type LocalGoalRun,
  LocalSessionService,
} from './local-session-service'

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

export type GoalLoopRisk = 'low' | 'high'

export interface GoalLoopApprovalScope {
  autoApprove: GoalLoopAction[]
  pauseFor: GoalLoopAction[]
}

export interface GoalLoopApprovalPolicy {
  mode: 'supervised' | 'full_browser'
  scope: 'goal_run'
}

export interface GoalLoopAgentStrategy {
  mode: 'auto' | 'single' | 'parallel'
  maxWorkers?: number
}

export interface GoalLoopContract {
  version: 1
  prompt: string
  completionCriteria: string[]
  approvalScope: GoalLoopApprovalScope
  approvalPolicy: GoalLoopApprovalPolicy
  agentStrategy: GoalLoopAgentStrategy
  retryLimit: number
  finalManifestShape: string[]
  createdAt: number
}

export interface GoalLoopQueueMetadata {
  action?: GoalLoopAction
  risk?: GoalLoopRisk
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
  x?: number
  y?: number
  text?: string
  value?: string
  clear?: boolean
  waitForText?: string
  waitForSelector?: string
  timeoutMs?: number
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

export interface CreateGoalLoopInput {
  id?: string
  sessionId?: string
  prompt: string
  completionCriteria?: string[]
  approvalScope?: Partial<GoalLoopApprovalScope>
  approvalPolicy?: GoalLoopApprovalPolicy
  agentStrategy?: GoalLoopAgentStrategy
  retryLimit?: number
  queueItems?: Array<
    Omit<GoalQueueItemInput, 'metadata' | 'maxAttempts'> & {
      maxAttempts?: number
      metadata?: GoalLoopQueueMetadata
    }
  >
  startImmediately?: boolean
}

export type GoalLoopExecutorStatus =
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'blocked'

export interface GoalLoopExecutorResult {
  status: GoalLoopExecutorStatus
  summary?: string
  sourceUrl?: string
  artifactPath?: string
  evidence?: unknown
  error?: string
  retryable?: boolean
  generatedQueueItems?: GoalQueueItemInput[]
}

export interface GoalLoopExecutionContext {
  goal: LocalGoalRun
  item: LocalGoalQueueItem
  contract: GoalLoopContract
  attempt: number
}

export interface GoalLoopItemExecutor {
  execute(context: GoalLoopExecutionContext): Promise<GoalLoopExecutorResult>
}

export interface GoalLoopRunOptions {
  maxItems?: number
  statuses?: Array<'running' | 'paused'>
  resumeReason?: GoalLoopContinuationReason
}

export interface GoalLoopResumeOptions {
  grantBlockedApproval?: boolean
}

export interface GoalLoopApprovalDecision {
  required: boolean
  action: GoalLoopAction
  reason?: string
}

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

export interface GoalLoopManifestItem {
  id: string
  title: string
  status: LocalGoalQueueItem['status']
  attempts: number
  maxAttempts: number
  sourceUrl?: string
  artifactPath?: string
  evidence?: unknown
  error?: string
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
  approvalScope: GoalLoopApprovalScope
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

export interface GoalLoopManifest {
  goalRunId: string
  prompt: string
  status: LocalGoalRun['status']
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

export interface GoalLoopProgress {
  goalRunId: string
  status: LocalGoalRun['status']
  lifecycleStatus: GoalLoopLifecycleStatus
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
  approvalPolicy: GoalLoopApprovalPolicy
  agentStrategy: GoalLoopAgentStrategy
  workerStatus: {
    mode: GoalLoopAgentStrategy['mode']
    maxWorkers: number
    activeWorkers: number
  }
  lockStatus: {
    browserMutationLocked: boolean
    lockedByItemId?: string
  }
  manifest?: GoalLoopManifest
}

export interface GoalLoopRunResult {
  goal: LocalGoalRun
  status:
    | 'completed'
    | 'paused_for_approval'
    | 'blocked'
    | 'running'
    | 'cancelled'
    | 'not_found'
  processedItems: number
  manifest?: GoalLoopManifest
  approval?: GoalLoopApprovalDecision
  continuationPacket?: GoalLoopContinuationPacket
  background?: {
    started: boolean
    alreadyRunning?: boolean
  }
}

const DEFAULT_RETRY_LIMIT = 3
const DEFAULT_PARALLEL_WORKERS = 3
const MAX_PARALLEL_WORKERS = 8
const OURAIRPORTS_COUNTRIES_URL = 'https://ourairports.com/data/countries.csv'
const OURAIRPORTS_AIRPORTS_URL = 'https://ourairports.com/data/airports.csv'
const EUROCONTROL_EAD_BASIC_LOGIN_URL =
  'https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/'

const LOW_RISK_ACTIONS: GoalLoopAction[] = [
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
]

const HIGH_RISK_ACTIONS: GoalLoopAction[] = [
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
]

const ALL_GOAL_LOOP_ACTIONS: GoalLoopAction[] = [
  ...LOW_RISK_ACTIONS,
  ...HIGH_RISK_ACTIONS,
  'custom',
]

const HIGH_RISK_TEXT_PATTERNS: Array<[GoalLoopAction, RegExp]> = [
  ['credential', /\b(password|passcode|2fa|mfa|api\s*key|secret|token)\b/i],
  ['login', /\b(log\s*in|login|sign\s*in|sign\s*up|register)\b/i],
  ['purchase', /\b(purchase|buy|order|checkout|pay|subscribe)\b/i],
  ['upload', /\b(upload|attach\s+file|send\s+file)\b/i],
  ['delete', /\b(delete|remove|destroy|deactivate|cancel\s+subscription)\b/i],
  ['message', /\b(send\s+message|dm|direct\s+message|email|reply)\b/i],
  ['public_post', /\b(post|publish|tweet|comment)\b/i],
  ['billing_change', /\b(billing|payment|plan|invoice)\b/i],
  ['security_change', /\b(security|password|mfa|2fa)\b/i],
  ['account_change', /\b(account|profile|settings|email|phone|address)\b/i],
]

const LOW_RISK_TEXT_PATTERNS: Array<[GoalLoopAction, RegExp]> = [
  ['download', /\b(download|save\s+pdf|pdf|file)\b/i],
  ['extract', /\b(extract|collect|scrape|read\s+data|process|gather)\b/i],
  ['fill', /\b(fill|type|enter|set\s+(?:field|input)|populate)\b/i],
  ['select', /\b(select|choose|dropdown|drop\s*down|option)\b/i],
  ['check', /\b(check|tick|enable)\b/i],
  ['uncheck', /\b(uncheck|untick|disable)\b/i],
  ['read', /\b(read|review|summarize|inspect)\b/i],
  ['navigate', /\b(open|visit|go\s+to|navigate)\b/i],
  ['click', /\b(click|select|choose)\b/i],
  ['scroll', /\b(scroll)\b/i],
  ['verify', /\b(verify|check|confirm\s+locally)\b/i],
  ['write', /\b(write|save\s+manifest|record)\b/i],
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim() !== '',
  )
  return strings.length === value.length
    ? strings.map((entry) => entry.trim())
    : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readGoalLoopAction(value: unknown): GoalLoopAction | undefined {
  return typeof value === 'string' && isGoalLoopAction(value)
    ? value
    : undefined
}

function readGoalLoopActionArray(value: unknown): GoalLoopAction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const actions = value.map(readGoalLoopAction)
  return actions.every(Boolean) ? (actions as GoalLoopAction[]) : undefined
}

function isGoalLoopAction(value: string): value is GoalLoopAction {
  return (
    LOW_RISK_ACTIONS.includes(value as GoalLoopAction) ||
    HIGH_RISK_ACTIONS.includes(value as GoalLoopAction) ||
    value === 'custom'
  )
}

function readQueueMetadata(value: unknown): GoalLoopQueueMetadata {
  const record = asRecord(value)
  const risk =
    record.risk === 'high' || record.risk === 'low' ? record.risk : undefined
  const scrollDirection =
    record.scrollDirection === 'up' ||
    record.scrollDirection === 'down' ||
    record.scrollDirection === 'left' ||
    record.scrollDirection === 'right'
      ? record.scrollDirection
      : undefined
  const downloadMode =
    record.downloadMode === 'pdf' ||
    record.downloadMode === 'click' ||
    record.downloadMode === 'url'
      ? record.downloadMode
      : undefined
  const sourceKind =
    record.sourceKind === 'ourairports-countries' ||
    record.sourceKind === 'ourairports-airports' ||
    record.sourceKind === 'ourairports-country'
      ? record.sourceKind
      : undefined
  const queueExpansion =
    record.queueExpansion === 'ourairports-countries'
      ? record.queueExpansion
      : undefined
  return {
    action: readGoalLoopAction(record.action),
    risk,
    description: readString(record.description),
    approvalRequired:
      typeof record.approvalRequired === 'boolean'
        ? record.approvalRequired
        : undefined,
    approvalGranted:
      typeof record.approvalGranted === 'boolean'
        ? record.approvalGranted
        : undefined,
    approvedAt: readNumber(record.approvedAt),
    approvalReason: readString(record.approvalReason),
    requiresQueueExpansion:
      typeof record.requiresQueueExpansion === 'boolean'
        ? record.requiresQueueExpansion
        : undefined,
    expansionReason: readString(record.expansionReason),
    url: readString(record.url),
    pageId: readNumber(record.pageId),
    selector: readString(record.selector),
    element: readNumber(record.element),
    x: readNumber(record.x),
    y: readNumber(record.y),
    text: readString(record.text),
    value: readString(record.value),
    clear: typeof record.clear === 'boolean' ? record.clear : undefined,
    waitForText: readString(record.waitForText),
    waitForSelector: readString(record.waitForSelector),
    timeoutMs: readNumber(record.timeoutMs),
    scrollDirection,
    scrollAmount: readNumber(record.scrollAmount),
    downloadMode,
    outputPath: readString(record.outputPath),
    filename: readString(record.filename),
    sourceKind,
    queueExpansion,
    countryCode: readString(record.countryCode),
    countryName: readString(record.countryName),
  }
}

function inferActionFromText(text: string): GoalLoopAction {
  for (const [action, pattern] of HIGH_RISK_TEXT_PATTERNS) {
    if (pattern.test(text)) return action
  }
  for (const [action, pattern] of LOW_RISK_TEXT_PATTERNS) {
    if (pattern.test(text)) return action
  }
  return 'read'
}

function inferHighRiskActionFromText(text: string): GoalLoopAction | undefined {
  for (const [action, pattern] of HIGH_RISK_TEXT_PATTERNS) {
    if (pattern.test(text)) return action
  }
  return undefined
}

function stripConditionalHighRiskInstructions(text: string): string {
  const hasConditionalAuth =
    /\bif\b[\s\S]{0,260}\b(?:log\s*in|login|sign\s*in|sign\s*up|register|password|credential|gmail)\b/i.test(
      text,
    )
  if (!hasConditionalAuth) return text

  let cleaned = text.replace(
    /\bif\b[\s\S]{0,260}?(?=\b(?:keep\s+working|process|all\s+remaining|remaining\s+blocked)\b)/gi,
    ' ',
  )
  if (cleaned === text) {
    cleaned = text.replace(
      /\bif\b[^.\r\n]*(?:log\s*in|login|sign\s*in|sign\s*up|register|password|credential|gmail)[^.\r\n]*/gi,
      ' ',
    )
  }
  return cleaned.replace(/\s+/g, ' ').trim() || text
}

function inferQueueActionFromText(text: string): GoalLoopAction {
  return inferActionFromText(stripConditionalHighRiskInstructions(text))
}

function isBroadNaturalLanguageGoal(text: string): boolean {
  return (
    /\bkeep\s+working\s+until\b/i.test(text) ||
    /\b(?:all|every|each)\b[\s\S]{0,120}\b(?:airports?|countries|world|remaining)\b/i.test(
      text,
    ) ||
    /\b(?:remaining|blocked|missing)\b[\s\S]{0,120}\b(?:airports?|countries)\b/i.test(
      text,
    ) ||
    /\b(?:airports?|countries)\b[\s\S]{0,120}\b(?:remaining|blocked|missing|complete)\b/i.test(
      text,
    ) ||
    /\b(?:download|process|recover|validate)\b[\s\S]{0,120}\b(?:remaining|blocked|missing)\b/i.test(
      text,
    )
  )
}

function isBroadAirportSourceGoal(text: string): boolean {
  if (
    /\b(?:aip|chart|charts|pdf|blocked|missing|remaining|log\s*in|login|sign\s*in|sign\s*up|register|auth(?:enticate|entication)?|credential|gmail|eurocontrol)\b/i.test(
      text,
    )
  ) {
    return false
  }

  return (
    isBroadNaturalLanguageGoal(text) &&
    /\b(?:ourairports|airport\s+(?:csv|data(?:base|set)?|catalog|records?|source\s+list)|csv\s+(?:of|for)\s+airports?)\b/i.test(
      text,
    )
  )
}

function broadGoalExpansionReason(text: string): string | undefined {
  if (!isBroadNaturalLanguageGoal(text)) return undefined
  return [
    'This is a broad multi-source goal and needs a durable source list or generated work queue before it can be considered complete.',
    'Goal Loop should not mark all countries, all airports, or all remaining blocked sources complete after reading only the current page.',
  ].join(' ')
}

function riskForAction(action: GoalLoopAction): GoalLoopRisk {
  return HIGH_RISK_ACTIONS.includes(action) ? 'high' : 'low'
}

function queueItemsForBroadAirportSourceGoal(
  prompt: string,
  retryLimit: number,
): GoalQueueItemInput[] | undefined {
  if (!isBroadAirportSourceGoal(prompt)) return undefined
  const planningPrompt = stripConditionalHighRiskInstructions(prompt)
  return [
    {
      orderIndex: 0,
      title: 'Download global country source list',
      maxAttempts: retryLimit,
      sourceUrl: OURAIRPORTS_COUNTRIES_URL,
      metadata: {
        action: 'download',
        risk: 'low',
        url: OURAIRPORTS_COUNTRIES_URL,
        downloadMode: 'url',
        filename: 'ourairports-countries.csv',
        sourceKind: 'ourairports-countries',
        description: planningPrompt,
      },
    },
    {
      orderIndex: 1,
      title: 'Download global airport source list and expand countries',
      maxAttempts: retryLimit,
      sourceUrl: OURAIRPORTS_AIRPORTS_URL,
      metadata: {
        action: 'download',
        risk: 'low',
        url: OURAIRPORTS_AIRPORTS_URL,
        downloadMode: 'url',
        filename: 'ourairports-airports.csv',
        sourceKind: 'ourairports-airports',
        queueExpansion: 'ourairports-countries',
        description: planningPrompt,
      },
    },
  ]
}

function extractNamedCredential(
  prompt: string,
  label: 'username' | 'password',
): string | undefined {
  const pattern =
    label === 'username'
      ? /\buser\s*name\b|\busername\b/i
      : /\bpassword\b|\bpasscode\b/i
  const match = prompt.match(
    new RegExp(`(?:${pattern.source})\\s*(?:is|=|:)\\s*([^\\s,.;]+)`, 'i'),
  )
  return match?.[1]?.trim()
}

function queueItemsForKnownAuthRecoveryGoal(
  prompt: string,
  retryLimit: number,
): GoalQueueItemInput[] | undefined {
  if (!/\b(?:eurocontrol|ead\s*basic)\b/i.test(prompt)) return undefined
  if (!/\b(?:log\s*in|login|sign\s*in|register|download)\b/i.test(prompt)) {
    return undefined
  }

  const username = extractNamedCredential(prompt, 'username')
  const password = extractNamedCredential(prompt, 'password')
  if (!username && !password) return undefined

  const items: GoalQueueItemInput[] = [
    {
      orderIndex: 0,
      title: 'Open Eurocontrol EAD Basic login',
      maxAttempts: retryLimit,
      sourceUrl: EUROCONTROL_EAD_BASIC_LOGIN_URL,
      metadata: {
        action: 'navigate',
        risk: 'low',
        url: EUROCONTROL_EAD_BASIC_LOGIN_URL,
        description: 'Open the Eurocontrol EAD Basic login page.',
      },
    },
  ]

  if (username) {
    items.push({
      orderIndex: items.length,
      title: 'Enter Eurocontrol username',
      maxAttempts: retryLimit,
      metadata: {
        action: 'fill',
        risk: 'high',
        selector: 'User Name:',
        value: username,
        clear: true,
        description: 'Fill the Eurocontrol username field.',
      },
    })
  }

  if (password) {
    items.push({
      orderIndex: items.length,
      title: 'Enter Eurocontrol password',
      maxAttempts: retryLimit,
      metadata: {
        action: 'fill',
        risk: 'high',
        selector: 'Password:',
        value: password,
        clear: true,
        description: 'Fill the Eurocontrol password field.',
      },
    })
  }

  items.push(
    {
      orderIndex: items.length,
      title: 'Submit Eurocontrol login',
      maxAttempts: retryLimit,
      metadata: {
        action: 'click',
        risk: 'high',
        selector: 'Login',
        description: 'Submit the Eurocontrol login form.',
      },
    },
    {
      orderIndex: items.length + 1,
      title: 'Read Eurocontrol post-login page and available download options',
      maxAttempts: retryLimit,
      metadata: {
        action: 'extract',
        risk: 'low',
        description:
          'After login, inspect the page for AIP, chart, country, airport, or download links.',
      },
    },
  )

  return items
}

function contractFromMetadata(goal: LocalGoalRun): GoalLoopContract {
  const metadata = asRecord(goal.metadata)
  const contract = asRecord(metadata.goalLoopContract)
  const approvalScope = asRecord(contract.approvalScope)
  const approvalPolicy = readApprovalPolicy(contract.approvalPolicy)
  return {
    version: 1,
    prompt: readString(contract.prompt) ?? goal.prompt,
    completionCriteria:
      readStringArray(contract.completionCriteria) ??
      defaultCompletionCriteria(),
    approvalScope: approvalScopeForPolicy(approvalPolicy, {
      autoApprove: readGoalLoopActionArray(approvalScope.autoApprove),
      pauseFor: readGoalLoopActionArray(approvalScope.pauseFor),
    }),
    approvalPolicy,
    agentStrategy: readAgentStrategy(contract.agentStrategy),
    retryLimit:
      typeof contract.retryLimit === 'number' && contract.retryLimit > 0
        ? Math.floor(contract.retryLimit)
        : DEFAULT_RETRY_LIMIT,
    finalManifestShape:
      readStringArray(contract.finalManifestShape) ??
      defaultFinalManifestShape(),
    createdAt:
      typeof contract.createdAt === 'number' &&
      Number.isFinite(contract.createdAt)
        ? contract.createdAt
        : goal.createdAt,
  }
}

function defaultCompletionCriteria(): string[] {
  return [
    'Every queue item is completed, skipped, failed, or blocked.',
    'A final manifest records completed, skipped, failed, blocked, output paths, source URLs, retry counts, and evidence summaries.',
  ]
}

function defaultFinalManifestShape(): string[] {
  return [
    'completed',
    'skipped',
    'failed',
    'blocked',
    'pending',
    'output paths',
    'source URLs',
    'retry counts',
    'evidence summaries',
  ]
}

function defaultApprovalScope(): GoalLoopApprovalScope {
  return {
    autoApprove: LOW_RISK_ACTIONS,
    pauseFor: HIGH_RISK_ACTIONS,
  }
}

function defaultApprovalPolicy(): GoalLoopApprovalPolicy {
  return {
    mode: 'supervised',
    scope: 'goal_run',
  }
}

function defaultAgentStrategy(): GoalLoopAgentStrategy {
  return {
    mode: 'auto',
    maxWorkers: 3,
  }
}

function readApprovalPolicy(value: unknown): GoalLoopApprovalPolicy {
  const record = asRecord(value)
  return {
    mode: record.mode === 'full_browser' ? 'full_browser' : 'supervised',
    scope: 'goal_run',
  }
}

function readAgentStrategy(value: unknown): GoalLoopAgentStrategy {
  const record = asRecord(value)
  const mode =
    record.mode === 'single' || record.mode === 'parallel'
      ? record.mode
      : 'auto'
  const maxWorkers = readNumber(record.maxWorkers)
  return {
    mode,
    maxWorkers:
      maxWorkers && maxWorkers > 0 ? Math.min(16, Math.floor(maxWorkers)) : 3,
  }
}

function mergeApprovalScope(
  scope: Partial<GoalLoopApprovalScope> | undefined,
): GoalLoopApprovalScope {
  const defaults = defaultApprovalScope()
  return {
    autoApprove: scope?.autoApprove?.length
      ? scope.autoApprove
      : defaults.autoApprove,
    pauseFor: scope?.pauseFor?.length ? scope.pauseFor : defaults.pauseFor,
  }
}

function approvalScopeForPolicy(
  policy: GoalLoopApprovalPolicy,
  scope: Partial<GoalLoopApprovalScope> | undefined,
): GoalLoopApprovalScope {
  if (policy.mode === 'full_browser') {
    return {
      autoApprove: ALL_GOAL_LOOP_ACTIONS,
      pauseFor: [],
    }
  }
  return mergeApprovalScope(scope)
}

function buildContract(input: CreateGoalLoopInput): GoalLoopContract {
  const retryLimit =
    input.retryLimit && input.retryLimit > 0
      ? Math.floor(input.retryLimit)
      : DEFAULT_RETRY_LIMIT
  const approvalPolicy = input.approvalPolicy ?? defaultApprovalPolicy()
  return {
    version: 1,
    prompt: input.prompt,
    completionCriteria: input.completionCriteria?.length
      ? input.completionCriteria
      : defaultCompletionCriteria(),
    approvalScope: approvalScopeForPolicy(approvalPolicy, input.approvalScope),
    approvalPolicy,
    agentStrategy: input.agentStrategy ?? defaultAgentStrategy(),
    retryLimit,
    finalManifestShape: defaultFinalManifestShape(),
    createdAt: Date.now(),
  }
}

function isBrowserMutationAction(action: GoalLoopAction | undefined): boolean {
  return (
    action === 'navigate' ||
    action === 'click' ||
    action === 'scroll' ||
    action === 'fill' ||
    action === 'select' ||
    action === 'check' ||
    action === 'uncheck' ||
    action === 'write' ||
    action === 'login' ||
    action === 'credential' ||
    action === 'purchase' ||
    action === 'upload' ||
    action === 'delete' ||
    action === 'account_change' ||
    action === 'billing_change' ||
    action === 'security_change' ||
    action === 'public_post' ||
    action === 'message' ||
    action === 'custom'
  )
}

function isBrowserMutationQueueItem(metadata: GoalLoopQueueMetadata): boolean {
  if (metadata.action === 'download') {
    return metadata.downloadMode === 'click' || metadata.element !== undefined
  }
  return isBrowserMutationAction(metadata.action)
}

function isParallelSafeQueueItem(metadata: GoalLoopQueueMetadata): boolean {
  if (
    metadata.action === 'read' ||
    metadata.action === 'extract' ||
    metadata.action === 'verify'
  ) {
    return true
  }

  return (
    metadata.action === 'download' &&
    metadata.downloadMode !== 'click' &&
    metadata.element === undefined
  )
}

function clampWorkerCount(value: number | undefined): number {
  const requested =
    value && Number.isFinite(value)
      ? Math.floor(value)
      : DEFAULT_PARALLEL_WORKERS
  return Math.max(1, Math.min(MAX_PARALLEL_WORKERS, requested))
}

interface ExtractedUrl {
  url: string
  index: number
  endIndex: number
}

function cleanUrl(rawUrl: string): string {
  return rawUrl.replace(/[),.;]+$/, '')
}

function extractUrlEntries(text: string): ExtractedUrl[] {
  const seen = new Set<string>()
  const entries: ExtractedUrl[] = []
  for (const match of text.matchAll(/https?:\/\/\S+/g)) {
    const url = cleanUrl(match[0])
    if (!url || seen.has(url)) continue
    seen.add(url)
    entries.push({
      url,
      index: match.index ?? 0,
      endIndex: (match.index ?? 0) + url.length,
    })
  }
  return entries
}

function taskLinesFromPrompt(prompt: string): string[] {
  return prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean)
    .filter((line) => line !== prompt.trim())
}

function actionVerb(action: GoalLoopAction): string {
  switch (action) {
    case 'download':
      return 'Download'
    case 'navigate':
      return 'Open'
    case 'click':
      return 'Click'
    case 'scroll':
      return 'Scroll'
    case 'extract':
      return 'Extract'
    case 'verify':
      return 'Verify'
    case 'write':
      return 'Record'
    default:
      return 'Read'
  }
}

function urlContext(prompt: string, entry: ExtractedUrl): string {
  const beforeWindow = prompt.slice(Math.max(0, entry.index - 180), entry.index)
  const beforeClause =
    beforeWindow
      .split(/\bthen\b|[.;\r\n]/i)
      .at(-1)
      ?.trim() ?? ''
  const afterWindow = prompt.slice(entry.endIndex, entry.endIndex + 120)
  const afterClause = afterWindow.split(/\bthen\b|[.;\r\n]/i)[0]?.trim() ?? ''
  return `${beforeClause} ${afterClause} ${entry.url}`.replace(
    /https?:\/\/\S+/g,
    ' ',
  )
}

function inferUrlAction(prompt: string, entry: ExtractedUrl): GoalLoopAction {
  if (/\.pdf(?:[?#].*)?$/i.test(entry.url)) return 'download'
  return inferActionFromText(urlContext(prompt, entry))
}

function extractDelimitedWorkItems(prompt: string): string[] {
  if (broadGoalExpansionReason(prompt)) return []

  const withoutUrls = prompt.replace(/https?:\/\/\S+/g, ' ')
  const explicitList =
    withoutUrls.match(/:\s*(.+)$/s)?.[1] ??
    withoutUrls.match(/\bfor\s+(.+)$/is)?.[1] ??
    ''
  if (!explicitList) return []

  const parts = explicitList
    .split(/\r?\n|;|,(?!\d)|\band\b/gi)
    .map((part) =>
      part
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim(),
    )
    .filter((part) => part.length >= 2 && part.length <= 140)
    .filter((part) => !/^(all|every|each)$/i.test(part))

  return [...new Set(parts)]
}

function queueItemsFromPrompt(
  prompt: string,
  retryLimit: number,
): GoalQueueItemInput[] {
  const authRecoveryItems = queueItemsForKnownAuthRecoveryGoal(
    prompt,
    retryLimit,
  )
  if (authRecoveryItems) return authRecoveryItems

  const broadAirportItems = queueItemsForBroadAirportSourceGoal(
    prompt,
    retryLimit,
  )
  if (broadAirportItems) return broadAirportItems

  const planningPrompt = stripConditionalHighRiskInstructions(prompt)
  const taskLines = taskLinesFromPrompt(planningPrompt)
  const urlEntries = extractUrlEntries(prompt)

  if (urlEntries.length > 0) {
    return urlEntries.map((entry, orderIndex) => {
      const url = entry.url
      const sourceLine =
        taskLines.find((line) => line.includes(url)) ?? prompt.trim()
      const action = inferUrlAction(prompt, entry)
      return {
        orderIndex,
        title: `${actionVerb(action)} ${url}`,
        maxAttempts: retryLimit,
        sourceUrl: url,
        metadata: {
          action,
          risk: 'low',
          url,
          description: sourceLine,
        },
      }
    })
  }

  const delimitedItems = extractDelimitedWorkItems(planningPrompt)
  const inferredAction = inferQueueActionFromText(prompt)
  const expansionReason = broadGoalExpansionReason(prompt)

  if (expansionReason) {
    return [
      {
        orderIndex: 0,
        title: 'Build durable source/work queue before executing broad goal',
        maxAttempts: retryLimit,
        sourceUrl: undefined,
        metadata: {
          action: inferredAction,
          risk: riskForAction(inferredAction),
          description: planningPrompt === prompt ? undefined : planningPrompt,
          requiresQueueExpansion: true,
          expansionReason,
        },
      },
    ]
  }

  const titles =
    taskLines.length > 0
      ? taskLines
      : delimitedItems.length > 1
        ? delimitedItems.map((item) => `${actionVerb(inferredAction)} ${item}`)
        : [prompt.trim()]

  return titles.map((title, orderIndex) => ({
    orderIndex,
    title,
    maxAttempts: retryLimit,
    sourceUrl: undefined,
    metadata: {
      action: inferQueueActionFromText(title),
      risk: riskForAction(inferQueueActionFromText(title)),
      description: planningPrompt === prompt ? undefined : planningPrompt,
    },
  }))
}

function manifestItem(item: LocalGoalQueueItem): GoalLoopManifestItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
    sourceUrl: item.sourceUrl,
    artifactPath: item.artifactPath,
    evidence: item.evidence,
    error: item.error,
  }
}

function queueCounts(goal: LocalGoalRun): GoalLoopProgress['queueCounts'] {
  return {
    pending: goal.queue.filter((item) => item.status === 'pending').length,
    running: goal.queue.filter((item) => item.status === 'running').length,
    completed: goal.queue.filter((item) => item.status === 'completed').length,
    skipped: goal.queue.filter((item) => item.status === 'skipped').length,
    failed: goal.queue.filter((item) => item.status === 'failed').length,
    blocked: goal.queue.filter((item) => item.status === 'blocked').length,
  }
}

function latestCheckpoint(goal: LocalGoalRun): LocalGoalCheckpoint | undefined {
  return goal.checkpoints.at(-1)
}

function summarizeCheckpoint(
  checkpoint: LocalGoalCheckpoint | undefined,
): GoalLoopCheckpointSummary | undefined {
  if (!checkpoint) return undefined
  return {
    id: checkpoint.id,
    type: checkpoint.type,
    summary: checkpoint.summary,
    createdAt: checkpoint.createdAt,
  }
}

function isContinuationPacket(
  value: unknown,
): value is GoalLoopContinuationPacket {
  const record = asRecord(value)
  return record.version === 1 && readString(record.resumePrompt) !== undefined
}

function compactItems(
  items: LocalGoalQueueItem[],
  limit = 50,
): GoalLoopManifestItem[] {
  return items.slice(0, limit).map(manifestItem)
}

function continuationNextAction(goal: LocalGoalRun): string {
  const current =
    goal.queue.find((item) => item.status === 'running') ??
    goal.queue.find((item) => item.status === 'pending') ??
    goal.queue.find((item) => item.status === 'blocked')

  if (!current) {
    return 'Generate or review the final manifest.'
  }
  if (current.status === 'blocked') {
    const metadata = readQueueMetadata(current.metadata)
    if (metadata.approvalRequired && !metadata.approvalGranted) {
      return `Wait for approval or user input for "${current.title}".`
    }
    return `Review the blocked queue item "${current.title}" and fix the missing target, source, or executor data before continuing.`
  }
  return `Continue with queue item "${current.title}".`
}

function buildResumePrompt(
  goal: LocalGoalRun,
  contract: GoalLoopContract,
  counts: GoalLoopProgress['queueCounts'],
  reason: GoalLoopContinuationReason,
  lastCheckpoint?: GoalLoopCheckpointSummary,
): string {
  const pendingOrRunning = counts.pending + counts.running
  const checkpointLine = lastCheckpoint
    ? `Last checkpoint: ${lastCheckpoint.type} - ${lastCheckpoint.summary}`
    : 'Last checkpoint: none'

  return [
    'Resume this PannamOS Goal Loop from local durable state.',
    `Goal run id: ${goal.id}`,
    `Reason: ${reason}`,
    `Objective: ${goal.prompt}`,
    `Queue: ${counts.completed} completed, ${counts.skipped} skipped, ${counts.failed} failed, ${counts.blocked} blocked, ${pendingOrRunning} pending/running.`,
    `Auto-approved actions: ${contract.approvalScope.autoApprove.join(', ')}`,
    `Pause for: ${
      contract.approvalScope.pauseFor.length
        ? contract.approvalScope.pauseFor.join(', ')
        : 'none'
    }`,
    checkpointLine,
    `Next action: ${continuationNextAction(goal)}`,
    'Do not depend on visible chat history. Reload the queue, checkpoints, evidence, artifacts, and approval scope from local SQLite before continuing.',
  ].join('\n')
}

function lifecycleFromGoal(
  goal: LocalGoalRun,
  checkpoint: LocalGoalCheckpoint | undefined,
): GoalLoopLifecycleStatus {
  if (goal.status === 'completed') return 'complete'
  if (goal.status === 'cancelled') return 'cancelled'
  if (goal.status === 'blocked') return 'blocked'
  if (goal.status === 'paused') return 'paused'
  if (checkpoint?.type === 'loop.compacted') return 'compacting'
  if (checkpoint?.type === 'loop.resuming') return 'resuming'
  if (checkpoint?.type.startsWith('loop.error')) return 'error'
  return 'running'
}

class MissingGoalLoopExecutor implements GoalLoopItemExecutor {
  async execute(): Promise<GoalLoopExecutorResult> {
    return {
      status: 'blocked',
      error: 'No Goal Loop item executor is configured.',
      summary: 'Goal Loop paused because no item executor is configured.',
    }
  }
}

interface RunnableGoalLoopItem {
  item: LocalGoalQueueItem
  metadata: GoalLoopQueueMetadata
  action: GoalLoopAction
}

interface GoalLoopSelection {
  items: RunnableGoalLoopItem[]
  approvalItem?: LocalGoalQueueItem
  approval?: GoalLoopApprovalDecision
}

interface GoalLoopItemOutcome {
  processedItems: number
  blocked?: {
    item: LocalGoalQueueItem
    action: GoalLoopAction
    reason: string
  }
}

export class GoalLoopService {
  private readonly service: LocalSessionService
  private readonly executor: GoalLoopItemExecutor
  private readonly activeRunIds = new Set<string>()
  private readonly backgroundRunIds = new Set<string>()
  private readonly browserMutationLocks = new Map<string, string>()
  private readonly browserMutationQueues = new Map<string, Promise<void>>()

  constructor(
    options: {
      service?: LocalSessionService
      executor?: GoalLoopItemExecutor
    } = {},
  ) {
    this.service = options.service ?? new LocalSessionService()
    this.executor = options.executor ?? new MissingGoalLoopExecutor()
  }

  private appendGeneratedQueueItems(
    goal: LocalGoalRun,
    parentItem: LocalGoalQueueItem,
    queueItems: GoalQueueItemInput[] | undefined,
  ): LocalGoalQueueItem[] {
    if (!queueItems?.length) return []

    const current = this.service.getGoal(goal.id) ?? goal
    let nextOrder =
      current.queue.reduce(
        (max, item) => Math.max(max, item.orderIndex),
        parentItem.orderIndex,
      ) + 1
    const appended = queueItems.map((item) =>
      this.service.upsertGoalQueueItem({
        ...item,
        goalRunId: goal.id,
        orderIndex: item.orderIndex ?? nextOrder++,
      }),
    )

    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'queue.expanded',
      summary: `Generated ${appended.length} durable queue item${appended.length === 1 ? '' : 's'} from "${parentItem.title}".`,
      state: {
        parentItemId: parentItem.id,
        generatedItemIds: appended.map((item) => item.id),
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.queue_expanded',
      summary: `Generated ${appended.length} durable queue item${appended.length === 1 ? '' : 's'}.`,
      payload: {
        parentItemId: parentItem.id,
        generatedItemIds: appended.map((item) => item.id),
      },
    })
    return appended
  }

  markResuming(
    goalRunId: string,
    reason: GoalLoopContinuationReason = 'manual_resume',
    options: GoalLoopResumeOptions = {},
  ): LocalGoalRun | null {
    const existing = this.service.getGoal(goalRunId)
    if (!existing) return null
    if (existing.status === 'completed' || existing.status === 'cancelled') {
      return existing
    }

    let goal = this.service.updateGoalStatus(goalRunId, 'running')
    if (!goal) return null
    if (options.grantBlockedApproval) {
      goal = this.grantBlockedApprovals(goal, reason)
    }
    this.recordResumingCheckpoint(goal, reason)
    return this.service.getGoal(goalRunId) ?? goal
  }

  private grantBlockedApprovals(
    goal: LocalGoalRun,
    reason: GoalLoopContinuationReason,
  ): LocalGoalRun {
    const now = Date.now()
    const approvedItems: GoalLoopManifestItem[] = []

    for (const item of goal.queue) {
      if (item.status !== 'blocked') continue
      const metadata = readQueueMetadata(item.metadata)
      if (!metadata.approvalRequired && !metadata.approvalGranted) continue

      const action =
        metadata.action ??
        inferActionFromText(`${item.title} ${item.sourceUrl ?? ''}`)
      const updated = this.service.updateGoalQueueItem(goal.id, item.id, {
        status: 'pending',
        error: null,
        metadata: {
          ...metadata,
          action,
          approvalRequired: false,
          approvalGranted: true,
          approvedAt: metadata.approvedAt ?? now,
          approvalReason: undefined,
        },
      })
      if (updated) approvedItems.push(manifestItem(updated))
    }

    const refreshed = this.service.getGoal(goal.id) ?? goal
    if (approvedItems.length === 0) return refreshed

    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'approval.granted',
      summary: `User approval granted for ${approvedItems.length} blocked queue item${approvedItems.length === 1 ? '' : 's'}.`,
      state: {
        reason,
        approvedItems,
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.approval_granted',
      summary: `User approval granted for ${approvedItems.length} blocked queue item${approvedItems.length === 1 ? '' : 's'}.`,
      payload: {
        reason,
        count: approvedItems.length,
        itemIds: approvedItems.map((item) => item.id),
      },
    })

    return this.service.getGoal(goal.id) ?? refreshed
  }

  private recordResumingCheckpoint(
    goal: LocalGoalRun,
    reason: GoalLoopContinuationReason,
  ) {
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'loop.resuming',
      summary: `Goal Loop resume requested (${reason})`,
      state: {
        reason,
        queueCounts: queueCounts(goal),
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.loop.resuming',
      summary: `Goal Loop resume requested (${reason})`,
      payload: {
        reason,
      },
    })
  }

  startBackgroundRun(
    goalRunId: string,
    options: GoalLoopRunOptions = {},
  ): GoalLoopRunResult {
    let goal = this.service.getGoal(goalRunId)
    if (!goal) {
      return {
        goal: null as unknown as LocalGoalRun,
        status: 'not_found',
        processedItems: 0,
      }
    }

    if (goal.status === 'cancelled') {
      return { goal, status: 'cancelled', processedItems: 0 }
    }
    if (goal.status === 'completed') {
      return {
        goal,
        status: 'completed',
        processedItems: 0,
        manifest: this.generateManifest(goal.id),
      }
    }

    if (
      this.activeRunIds.has(goalRunId) ||
      this.backgroundRunIds.has(goalRunId)
    ) {
      return {
        goal,
        status: 'running',
        processedItems: 0,
        continuationPacket: this.getContinuationInfo(goal)?.packet,
        background: {
          started: false,
          alreadyRunning: true,
        },
      }
    }

    goal = this.service.updateGoalStatus(goal.id, 'running') ?? goal
    this.backgroundRunIds.add(goalRunId)
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'loop.background_started',
      summary: 'Goal Loop background run started by the server.',
      state: {
        maxItems:
          options.maxItems && Number.isFinite(options.maxItems)
            ? options.maxItems
            : null,
        resumeReason: options.resumeReason,
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.loop.background_started',
      summary: 'Goal Loop background run started by the server.',
      payload: {
        maxItems:
          options.maxItems && Number.isFinite(options.maxItems)
            ? options.maxItems
            : null,
        resumeReason: options.resumeReason,
      },
    })

    void this.runGoal(goalRunId, options)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        const latest = this.service.getGoal(goalRunId)
        this.service.recordGoalCheckpoint({
          goalRunId,
          type: 'loop.error.background',
          summary: `Goal Loop background run failed: ${message}`,
          state: {
            error: message,
          },
        })
        this.service.recordAuditEvent({
          sessionId: latest?.sessionId,
          goalRunId,
          type: 'goal.loop.background_failed',
          summary: `Goal Loop background run failed: ${message}`,
          payload: {
            error: message,
          },
        })
      })
      .finally(() => {
        this.backgroundRunIds.delete(goalRunId)
      })

    const refreshed = this.service.getGoal(goalRunId) ?? goal
    return {
      goal: refreshed,
      status: 'running',
      processedItems: 0,
      continuationPacket: this.getContinuationInfo(refreshed)?.packet,
      background: {
        started: true,
      },
    }
  }

  private buildContinuationPacket(
    goal: LocalGoalRun,
    reason: GoalLoopContinuationReason,
  ): GoalLoopContinuationPacket {
    const contract = contractFromMetadata(goal)
    const counts = queueCounts(goal)
    const lastCheckpoint = summarizeCheckpoint(latestCheckpoint(goal))
    const completedItems = compactItems(
      goal.queue.filter((item) => item.status === 'completed'),
    )
    const pendingItems = compactItems(
      goal.queue.filter(
        (item) => item.status === 'pending' || item.status === 'running',
      ),
    )
    const blockedItems = compactItems(
      goal.queue.filter((item) => item.status === 'blocked'),
    )
    const failedItems = compactItems(
      goal.queue.filter((item) => item.status === 'failed'),
    )
    const current =
      goal.queue.find((item) => item.status === 'running') ??
      goal.queue.find((item) => item.status === 'blocked') ??
      goal.queue.find((item) => item.status === 'pending')
    const artifacts = goal.queue
      .filter((item) => Boolean(item.artifactPath))
      .slice(0, 100)
      .map((item) => ({
        itemId: item.id,
        title: item.title,
        path: item.artifactPath as string,
        sourceUrl: item.sourceUrl,
      }))
    const constraints = [
      ...contract.completionCriteria,
      `Auto-approve only: ${contract.approvalScope.autoApprove.join(', ')}`,
      `Pause for: ${
        contract.approvalScope.pauseFor.length
          ? contract.approvalScope.pauseFor.join(', ')
          : 'none'
      }`,
    ]
    const resumePrompt = buildResumePrompt(
      goal,
      contract,
      counts,
      reason,
      lastCheckpoint,
    )

    return {
      version: 1,
      goalRunId: goal.id,
      generatedAt: Date.now(),
      reason,
      objective: goal.prompt,
      constraints,
      approvalScope: contract.approvalScope,
      queueCounts: counts,
      currentItem: current ? manifestItem(current) : undefined,
      lastCheckpoint,
      completedItems,
      pendingItems,
      blockedItems,
      failedItems,
      artifacts,
      nextAction: continuationNextAction(goal),
      resumePrompt,
    }
  }

  private recordContinuationPacket(
    goalRunId: string,
    reason: GoalLoopContinuationReason,
  ): GoalLoopContinuationPacket | undefined {
    const goal = this.service.getGoal(goalRunId)
    if (!goal) return undefined

    const packet = this.buildContinuationPacket(goal, reason)
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'loop.compacted',
      summary: `Goal Loop continuation packet saved (${reason})`,
      state: packet,
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.loop.compacted',
      summary: `Goal Loop continuation packet saved (${reason})`,
      payload: {
        reason,
        queueCounts: packet.queueCounts,
        nextAction: packet.nextAction,
      },
    })
    return packet
  }

  private getContinuationInfo(
    goal: LocalGoalRun,
  ): GoalLoopProgress['continuation'] {
    const compactions = goal.checkpoints.filter(
      (checkpoint) => checkpoint.type === 'loop.compacted',
    )
    const latestCompaction = compactions.at(-1)
    const packet = isContinuationPacket(latestCompaction?.state)
      ? latestCompaction.state
      : undefined

    return {
      count: compactions.length,
      lastCompactedAt: latestCompaction?.createdAt,
      packet,
    }
  }

  createGoal(input: CreateGoalLoopInput): LocalGoalRun {
    const contract = buildContract(input)
    const queueItems =
      input.queueItems?.length && input.queueItems.length > 0
        ? input.queueItems.map((item, orderIndex) => ({
            ...item,
            orderIndex: item.orderIndex ?? orderIndex,
            maxAttempts: item.maxAttempts ?? contract.retryLimit,
            metadata: {
              action:
                item.metadata?.action ??
                inferActionFromText(`${item.title} ${item.sourceUrl ?? ''}`),
              risk:
                item.metadata?.risk ??
                riskForAction(
                  item.metadata?.action ??
                    inferActionFromText(
                      `${item.title} ${item.sourceUrl ?? ''}`,
                    ),
                ),
              description: item.metadata?.description,
              approvalRequired: item.metadata?.approvalRequired,
              approvalGranted: item.metadata?.approvalGranted,
              approvedAt: item.metadata?.approvedAt,
              approvalReason: item.metadata?.approvalReason,
              requiresQueueExpansion: item.metadata?.requiresQueueExpansion,
              expansionReason: item.metadata?.expansionReason,
              url: item.metadata?.url,
              pageId: item.metadata?.pageId,
              selector: item.metadata?.selector,
              element: item.metadata?.element,
              x: item.metadata?.x,
              y: item.metadata?.y,
              text: item.metadata?.text,
              value: item.metadata?.value,
              clear: item.metadata?.clear,
              waitForText: item.metadata?.waitForText,
              waitForSelector: item.metadata?.waitForSelector,
              timeoutMs: item.metadata?.timeoutMs,
              scrollDirection: item.metadata?.scrollDirection,
              scrollAmount: item.metadata?.scrollAmount,
              downloadMode: item.metadata?.downloadMode,
              outputPath: item.metadata?.outputPath,
              filename: item.metadata?.filename,
              sourceKind: item.metadata?.sourceKind,
              queueExpansion: item.metadata?.queueExpansion,
              countryCode: item.metadata?.countryCode,
              countryName: item.metadata?.countryName,
            },
          }))
        : queueItemsFromPrompt(input.prompt, contract.retryLimit)

    const goal = this.service.createGoal({
      id: input.id,
      sessionId: input.sessionId,
      prompt: input.prompt,
      status: input.startImmediately ? 'running' : 'paused',
      metadata: {
        goalLoopContract: contract,
      },
      queueItems,
    })

    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'loop.planned',
      summary: `Goal Loop planned ${queueItems.length} queue item${queueItems.length === 1 ? '' : 's'}`,
      state: {
        contract,
        queueItemCount: queueItems.length,
      },
    })

    return goal
  }

  getApprovalDecision(
    item: LocalGoalQueueItem,
    contract: GoalLoopContract,
  ): GoalLoopApprovalDecision {
    const metadata = readQueueMetadata(item.metadata)
    const riskText = [
      item.title,
      item.sourceUrl,
      metadata.description,
      metadata.selector,
      metadata.text,
      metadata.value,
    ]
      .filter(Boolean)
      .join(' ')
    const action =
      contract.approvalPolicy.mode === 'full_browser'
        ? (metadata.action ??
          inferActionFromText(`${item.title} ${item.sourceUrl ?? ''}`))
        : (inferHighRiskActionFromText(riskText) ??
          metadata.action ??
          inferActionFromText(`${item.title} ${item.sourceUrl ?? ''}`))

    if (metadata.approvalGranted) {
      return {
        required: false,
        action,
      }
    }

    if (contract.approvalPolicy.mode === 'full_browser') {
      return {
        required: false,
        action,
      }
    }

    if (metadata.approvalRequired || metadata.risk === 'high') {
      return {
        required: true,
        action,
        reason:
          metadata.approvalReason ??
          `Queue item "${item.title}" is marked high risk and requires approval.`,
      }
    }

    if (contract.approvalScope.pauseFor.includes(action)) {
      return {
        required: true,
        action,
        reason: `Action "${action}" requires approval before the Goal Loop can continue.`,
      }
    }

    return {
      required: !contract.approvalScope.autoApprove.includes(action),
      action,
      reason: contract.approvalScope.autoApprove.includes(action)
        ? undefined
        : `Action "${action}" is outside the current auto-approval scope.`,
    }
  }

  private resolveWorkerCount(
    goal: LocalGoalRun,
    contract: GoalLoopContract,
    maxItemsRemaining: number,
  ): number {
    if (maxItemsRemaining <= 1) return 1
    if (contract.agentStrategy.mode === 'single') return 1

    const requestedWorkers = clampWorkerCount(contract.agentStrategy.maxWorkers)
    if (contract.agentStrategy.mode === 'parallel') {
      return Math.min(requestedWorkers, maxItemsRemaining)
    }

    const runnablePrefix: LocalGoalQueueItem[] = []
    for (const item of goal.queue.filter(
      (entry) => entry.status === 'pending' || entry.status === 'running',
    )) {
      const approval = this.getApprovalDecision(item, contract)
      if (approval.required) break

      const metadata = {
        ...readQueueMetadata(item.metadata),
        action: approval.action,
      }
      if (!isParallelSafeQueueItem(metadata)) break
      runnablePrefix.push(item)
    }

    return runnablePrefix.length >= 3
      ? Math.min(requestedWorkers, runnablePrefix.length, maxItemsRemaining)
      : 1
  }

  private selectRunnableItems(
    goal: LocalGoalRun,
    contract: GoalLoopContract,
    maxItemsRemaining: number,
  ): GoalLoopSelection {
    const workerCount = this.resolveWorkerCount(
      goal,
      contract,
      maxItemsRemaining,
    )
    const items: RunnableGoalLoopItem[] = []

    for (const item of goal.queue.filter(
      (entry) => entry.status === 'pending' || entry.status === 'running',
    )) {
      const approval = this.getApprovalDecision(item, contract)
      if (approval.required) {
        if (items.length === 0) {
          return {
            items,
            approvalItem: item,
            approval,
          }
        }
        break
      }

      const metadata = {
        ...readQueueMetadata(item.metadata),
        action: approval.action,
      }
      const runnable = {
        item,
        metadata,
        action: approval.action,
      }

      if (items.length === 0) {
        items.push(runnable)
        if (workerCount === 1 || !isParallelSafeQueueItem(metadata)) break
        continue
      }

      if (items.length >= workerCount) break
      if (!isParallelSafeQueueItem(metadata)) break
      items.push(runnable)
    }

    return { items }
  }

  private pauseForApproval(
    goal: LocalGoalRun,
    item: LocalGoalQueueItem,
    approval: GoalLoopApprovalDecision,
    processedItems: number,
  ): GoalLoopRunResult {
    const blocked = this.service.updateGoalQueueItem(goal.id, item.id, {
      status: 'blocked',
      error: approval.reason ?? 'Approval required before continuing.',
      metadata: {
        ...readQueueMetadata(item.metadata),
        action: approval.action,
        approvalRequired: true,
        approvalReason: approval.reason,
      },
    })
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'approval.required',
      summary:
        approval.reason ??
        `Queue item "${item.title}" requires approval before continuing.`,
      state: {
        item: blocked ?? item,
        approval,
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.approval_required',
      summary:
        approval.reason ??
        `Queue item "${item.title}" requires approval before continuing.`,
      payload: {
        itemId: item.id,
        action: approval.action,
      },
    })
    const paused = this.service.updateGoalStatus(goal.id, 'paused') ?? goal
    const continuationPacket = this.recordContinuationPacket(goal.id, 'yield')
    return {
      goal: paused,
      status: 'paused_for_approval',
      processedItems,
      approval,
      continuationPacket,
    }
  }

  private async withBrowserMutationLock<T>(
    goalRunId: string,
    itemId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous =
      this.browserMutationQueues.get(goalRunId) ?? Promise.resolve()
    let release: () => void = () => {}
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => next)
    this.browserMutationQueues.set(goalRunId, tail)

    await previous
    this.browserMutationLocks.set(goalRunId, itemId)
    try {
      return await task()
    } finally {
      if (this.browserMutationLocks.get(goalRunId) === itemId) {
        this.browserMutationLocks.delete(goalRunId)
      }
      release()
      if (this.browserMutationQueues.get(goalRunId) === tail) {
        this.browserMutationQueues.delete(goalRunId)
      }
    }
  }

  private async executeRunnableItem(
    goal: LocalGoalRun,
    runnable: RunnableGoalLoopItem,
    contract: GoalLoopContract,
  ): Promise<GoalLoopItemOutcome> {
    const item = runnable.item
    const attempt =
      item.status === 'running' ? item.attempts : item.attempts + 1
    const runningItem =
      this.service.updateGoalQueueItem(goal.id, item.id, {
        status: 'running',
        attempts: attempt,
        error: null,
      }) ?? item
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.item.started',
      summary: `Started queue item "${runningItem.title}"`,
      payload: {
        itemId: runningItem.id,
        attempt,
        action: runnable.action,
      },
    })

    if (runnable.metadata.requiresQueueExpansion) {
      const reason =
        runnable.metadata.expansionReason ??
        'Goal needs a durable source list or generated work queue before this item can be considered complete.'
      const result = {
        status: 'blocked',
        summary: `Goal needs a durable source list before "${runningItem.title}" can be considered complete.`,
        sourceUrl: runningItem.sourceUrl,
        error: reason,
        retryable: false,
        evidence: {
          action: runnable.action,
          requiresQueueExpansion: true,
          expansionReason: reason,
        },
      } satisfies GoalLoopExecutorResult
      const updated = this.service.updateGoalQueueItem(
        goal.id,
        runningItem.id,
        {
          status: 'blocked',
          sourceUrl: result.sourceUrl ?? runningItem.sourceUrl ?? null,
          evidence: result.evidence,
          error: result.error,
        },
      )
      this.service.recordGoalCheckpoint({
        goalRunId: goal.id,
        type: 'item.blocked',
        summary: result.summary,
        state: {
          item: updated ?? runningItem,
          result,
        },
      })
      this.service.recordAuditEvent({
        sessionId: goal.sessionId,
        goalRunId: goal.id,
        type: 'goal.item.blocked',
        summary: result.summary,
        payload: {
          itemId: runningItem.id,
          attempt,
          sourceUrl: result.sourceUrl ?? runningItem.sourceUrl,
          error: result.error,
        },
      })
      return {
        processedItems: 1,
        blocked: {
          item: updated ?? runningItem,
          action: runnable.action,
          reason,
        },
      }
    }

    const execute = async () => {
      try {
        return await this.executor.execute({
          goal,
          item: runningItem,
          contract,
          attempt,
        })
      } catch (error) {
        return {
          status: 'failed',
          retryable: true,
          error: error instanceof Error ? error.message : String(error),
        } satisfies GoalLoopExecutorResult
      }
    }

    const result = isBrowserMutationQueueItem(runnable.metadata)
      ? await this.withBrowserMutationLock(goal.id, runningItem.id, execute)
      : await execute()

    const shouldRetry =
      result.status === 'failed' &&
      result.retryable !== false &&
      attempt < runningItem.maxAttempts

    if (shouldRetry) {
      this.service.updateGoalQueueItem(goal.id, runningItem.id, {
        status: 'pending',
        error: result.error ?? result.summary ?? 'Queue item failed.',
        evidence: result.evidence,
      })
      this.service.recordAuditEvent({
        sessionId: goal.sessionId,
        goalRunId: goal.id,
        type: 'goal.item.retry',
        summary: `Retrying queue item "${runningItem.title}"`,
        payload: {
          itemId: runningItem.id,
          attempt,
          maxAttempts: runningItem.maxAttempts,
          error: result.error,
        },
      })
      this.service.recordGoalCheckpoint({
        goalRunId: goal.id,
        type: 'loop.retry',
        summary: `Retrying queue item "${runningItem.title}" after attempt ${attempt}`,
        state: {
          itemId: runningItem.id,
          attempt,
          maxAttempts: runningItem.maxAttempts,
          error: result.error,
        },
      })
      return { processedItems: 1 }
    }

    const nextStatus =
      result.status === 'completed' || result.status === 'skipped'
        ? result.status
        : result.status === 'blocked'
          ? 'blocked'
          : 'failed'
    const updated = this.service.updateGoalQueueItem(goal.id, runningItem.id, {
      status: nextStatus,
      sourceUrl: result.sourceUrl ?? runningItem.sourceUrl ?? null,
      artifactPath: result.artifactPath ?? runningItem.artifactPath ?? null,
      evidence: result.evidence,
      error: result.error ?? null,
    })
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: `item.${nextStatus}`,
      summary:
        result.summary ??
        `Queue item "${runningItem.title}" marked ${nextStatus}.`,
      state: {
        item: updated ?? runningItem,
        result,
      },
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: `goal.item.${nextStatus}`,
      summary:
        result.summary ??
        `Queue item "${runningItem.title}" marked ${nextStatus}.`,
      payload: {
        itemId: runningItem.id,
        attempt,
        sourceUrl: result.sourceUrl ?? runningItem.sourceUrl,
        artifactPath: result.artifactPath ?? runningItem.artifactPath,
        error: result.error,
      },
    })

    if (nextStatus === 'completed' && result.generatedQueueItems?.length) {
      this.appendGeneratedQueueItems(
        this.service.getGoal(goal.id) ?? goal,
        updated ?? runningItem,
        result.generatedQueueItems,
      )
    }

    if (nextStatus === 'blocked') {
      return {
        processedItems: 1,
        blocked: {
          item: updated ?? runningItem,
          action: runnable.action,
          reason: result.error ?? result.summary ?? 'Queue item blocked.',
        },
      }
    }

    return { processedItems: 1 }
  }

  private pauseForBlockedOutcome(
    goalRunId: string,
    processedItems: number,
    _blocked: NonNullable<GoalLoopItemOutcome['blocked']>,
  ): GoalLoopRunResult {
    const goal = this.service.getGoal(goalRunId)
    if (!goal) {
      return {
        goal: null as unknown as LocalGoalRun,
        status: 'not_found',
        processedItems,
      }
    }

    const blockedGoal =
      this.service.updateGoalStatus(goal.id, 'blocked') ?? goal
    const continuationPacket = this.recordContinuationPacket(goal.id, 'yield')
    return {
      goal: blockedGoal,
      status: 'blocked',
      processedItems,
      continuationPacket,
    }
  }

  async runGoal(
    goalRunId: string,
    options: GoalLoopRunOptions = {},
  ): Promise<GoalLoopRunResult> {
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY
    let goal = this.service.getGoal(goalRunId)
    if (!goal) {
      return {
        goal: null as unknown as LocalGoalRun,
        status: 'not_found',
        processedItems: 0,
      }
    }
    if (goal.status === 'cancelled') {
      return { goal, status: 'cancelled', processedItems: 0 }
    }
    if (goal.status === 'completed') {
      return {
        goal,
        status: 'completed',
        processedItems: 0,
        manifest: this.generateManifest(goal.id),
      }
    }

    if (this.activeRunIds.has(goalRunId)) {
      return {
        goal,
        status: 'running',
        processedItems: 0,
        continuationPacket: this.getContinuationInfo(goal)?.packet,
      }
    }

    this.activeRunIds.add(goalRunId)
    try {
      const contract = contractFromMetadata(goal)
      const runningGoal =
        this.service.updateGoalStatus(goal.id, 'running') ?? goal
      if (options.resumeReason) {
        this.recordResumingCheckpoint(runningGoal, options.resumeReason)
      }
      this.service.recordGoalCheckpoint({
        goalRunId: goal.id,
        type: 'loop.started',
        summary: 'Goal Loop run started or resumed',
        state: {
          maxItems: Number.isFinite(maxItems) ? maxItems : null,
          resumeReason: options.resumeReason,
        },
      })

      let processedItems = 0

      while (processedItems < maxItems) {
        goal = this.service.getGoal(goalRunId)
        if (!goal) {
          return {
            goal: null as unknown as LocalGoalRun,
            status: 'not_found',
            processedItems,
          }
        }
        if (goal.status === 'cancelled') {
          return { goal, status: 'cancelled', processedItems }
        }

        const activeGoal = goal
        const selection = this.selectRunnableItems(
          activeGoal,
          contract,
          maxItems - processedItems,
        )

        if (selection.approval && selection.approvalItem) {
          return this.pauseForApproval(
            activeGoal,
            selection.approvalItem,
            selection.approval,
            processedItems,
          )
        }

        if (selection.items.length === 0) {
          return this.finishIfComplete(activeGoal.id, processedItems)
        }

        const outcomes = await Promise.all(
          selection.items.map((item) =>
            this.executeRunnableItem(activeGoal, item, contract),
          ),
        )
        processedItems += outcomes.reduce(
          (total, outcome) => total + outcome.processedItems,
          0,
        )

        const blocked = outcomes.find((outcome) => outcome.blocked)?.blocked
        if (blocked) {
          return this.pauseForBlockedOutcome(goal.id, processedItems, blocked)
        }
      }

      goal = this.service.getGoal(goalRunId) ?? goal
      const remaining = goal.queue.filter(
        (item) => item.status === 'pending' || item.status === 'running',
      ).length
      if (remaining === 0) {
        return this.finishIfComplete(goal.id, processedItems)
      }
      this.service.recordGoalCheckpoint({
        goalRunId: goal.id,
        type: 'loop.yielded',
        summary: 'Goal Loop yielded before all queue items were complete',
        state: {
          processedItems,
          remaining,
        },
      })
      const continuationPacket = this.recordContinuationPacket(
        goal.id,
        'pre_turn_limit',
      )
      return { goal, status: 'running', processedItems, continuationPacket }
    } finally {
      this.activeRunIds.delete(goalRunId)
    }
  }

  async resumeUnfinishedGoals(
    options: GoalLoopRunOptions = {},
  ): Promise<GoalLoopRunResult[]> {
    const statuses = options.statuses ?? ['running', 'paused']
    const goals = this.service
      .listGoalRuns(statuses)
      .filter((goal) =>
        goal.queue.some(
          (item) => item.status === 'pending' || item.status === 'running',
        ),
      )
    const results: GoalLoopRunResult[] = []
    for (const goal of goals) {
      results.push(await this.runGoal(goal.id, options))
    }
    return results
  }

  generateManifest(goalRunId: string): GoalLoopManifest {
    const goal = this.service.getGoal(goalRunId)
    if (!goal) throw new Error(`Goal not found: ${goalRunId}`)
    const contract = contractFromMetadata(goal)
    const completed = goal.queue
      .filter((item) => item.status === 'completed')
      .map(manifestItem)
    const skipped = goal.queue
      .filter((item) => item.status === 'skipped')
      .map(manifestItem)
    const failed = goal.queue
      .filter((item) => item.status === 'failed')
      .map(manifestItem)
    const blocked = goal.queue
      .filter((item) => item.status === 'blocked')
      .map(manifestItem)
    const pending = goal.queue
      .filter((item) => item.status === 'pending' || item.status === 'running')
      .map(manifestItem)

    return {
      goalRunId: goal.id,
      prompt: goal.prompt,
      status: goal.status,
      generatedAt: Date.now(),
      completionCriteria: contract.completionCriteria,
      totals: {
        completed: completed.length,
        skipped: skipped.length,
        failed: failed.length,
        blocked: blocked.length,
        pending: pending.length,
      },
      completed,
      skipped,
      failed,
      blocked,
      pending,
    }
  }

  compactGoal(
    goalRunId: string,
    reason: GoalLoopContinuationReason = 'manual_resume',
  ): GoalLoopContinuationPacket | null {
    return this.recordContinuationPacket(goalRunId, reason) ?? null
  }

  getProgress(goalRunId: string): GoalLoopProgress | null {
    const goal = this.service.getGoal(goalRunId)
    if (!goal) return null

    const contract = contractFromMetadata(goal)
    const counts = queueCounts(goal)
    const current =
      goal.queue.find((item) => item.status === 'running') ??
      goal.queue.find((item) => item.status === 'blocked') ??
      goal.queue.find((item) => item.status === 'pending')
    const metadata = readQueueMetadata(current?.metadata)
    const checkpoint = latestCheckpoint(goal)
    const manifest =
      goal.status === 'completed' ||
      goal.status === 'blocked' ||
      counts.pending + counts.running === 0
        ? this.generateManifest(goal.id)
        : undefined
    const shouldExposeContinuation =
      !manifest &&
      (goal.status === 'running' ||
        goal.status === 'paused' ||
        counts.pending + counts.running + counts.blocked > 0)
    const continuation = shouldExposeContinuation
      ? this.getContinuationInfo(goal)
      : undefined
    const lockedByItemId = this.browserMutationLocks.get(goal.id)
    const maxWorkers =
      contract.agentStrategy.mode === 'single'
        ? 1
        : clampWorkerCount(contract.agentStrategy.maxWorkers)

    return {
      goalRunId: goal.id,
      status: goal.status,
      lifecycleStatus: lifecycleFromGoal(goal, checkpoint),
      prompt: goal.prompt,
      queueCounts: counts,
      currentItem: current ? manifestItem(current) : undefined,
      pauseReason:
        goal.status === 'paused'
          ? metadata.approvalRequired
            ? (metadata.approvalReason ?? current?.error)
            : (current?.error ?? metadata.approvalReason)
          : undefined,
      retryCount: current?.attempts ?? 0,
      lastCheckpoint: summarizeCheckpoint(checkpoint),
      continuation,
      resumePrompt: continuation?.packet?.resumePrompt,
      approvalPolicy: contract.approvalPolicy,
      agentStrategy: contract.agentStrategy,
      workerStatus: {
        mode: contract.agentStrategy.mode,
        maxWorkers,
        activeWorkers: counts.running,
      },
      lockStatus: {
        browserMutationLocked: Boolean(lockedByItemId),
        lockedByItemId,
      },
      manifest,
    }
  }

  private finishIfComplete(
    goalRunId: string,
    processedItems: number,
  ): GoalLoopRunResult {
    const goal = this.service.getGoal(goalRunId)
    if (!goal) {
      return {
        goal: null as unknown as LocalGoalRun,
        status: 'not_found',
        processedItems,
      }
    }

    const blockedItems = goal.queue.filter((item) => item.status === 'blocked')
    const blockedCount = blockedItems.length
    const approvalBlocked = blockedItems.some((item) => {
      const metadata = readQueueMetadata(item.metadata)
      return metadata.approvalRequired && !metadata.approvalGranted
    })
    const updated = approvalBlocked
      ? this.service.updateGoalStatus(goal.id, 'paused')
      : blockedCount > 0
        ? this.service.updateGoalStatus(goal.id, 'blocked')
        : this.service.updateGoalStatus(goal.id, 'completed')
    const manifest = this.generateManifest(goal.id)
    this.service.recordGoalCheckpoint({
      goalRunId: goal.id,
      type: 'manifest.final',
      summary:
        blockedCount > 0
          ? 'Goal Loop paused with blocked queue items.'
          : 'Goal Loop completed and generated final manifest.',
      state: manifest,
    })
    this.service.recordAuditEvent({
      sessionId: goal.sessionId,
      goalRunId: goal.id,
      type: 'goal.manifest.final',
      summary:
        blockedCount > 0
          ? 'Goal Loop generated final manifest with blocked queue items.'
          : 'Goal Loop generated final manifest.',
      payload: manifest,
    })

    return {
      goal: updated ?? goal,
      status: approvalBlocked
        ? 'paused_for_approval'
        : blockedCount > 0
          ? 'blocked'
          : 'completed',
      processedItems,
      manifest,
    }
  }
}
