/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { UIMessage } from 'ai'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { type BrowserOsDatabase, getDb } from '../../lib/db'
import {
  type LocalAuditEventRow,
  type LocalGoalCheckpointRow,
  type LocalGoalQueueItemRow,
  type LocalGoalRunRow,
  type LocalSessionMessageRow,
  type LocalSessionRow,
  localAuditEvents,
  localGoalCheckpoints,
  localGoalQueueItems,
  localGoalRuns,
  localSessionMessages,
  localSessions,
} from '../../lib/db/schema'

export type LocalSessionStatus = 'active' | 'archived'
export type LocalGoalStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'blocked'
export type LocalGoalQueueStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'blocked'

export interface LocalSession {
  id: string
  title?: string
  status: LocalSessionStatus
  messages: UIMessage[]
  lastMessagedAt: number
  createdAt: number
  updatedAt: number
  metadata?: unknown
}

export interface LocalGoalRun {
  id: string
  sessionId?: string
  prompt: string
  status: LocalGoalStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  metadata?: unknown
  queue: LocalGoalQueueItem[]
  checkpoints: LocalGoalCheckpoint[]
}

export interface LocalGoalQueueItem {
  id: string
  goalRunId: string
  orderIndex: number
  title: string
  status: LocalGoalQueueStatus
  attempts: number
  maxAttempts: number
  sourceUrl?: string
  artifactPath?: string
  metadata?: unknown
  evidence?: unknown
  error?: string
  createdAt: number
  updatedAt: number
}

export interface LocalGoalCheckpoint {
  id: string
  goalRunId: string
  type: string
  summary: string
  state?: unknown
  createdAt: number
}

export interface LocalAuditEvent {
  id: string
  sessionId?: string
  goalRunId?: string
  type: string
  summary: string
  payload?: unknown
  createdAt: number
}

export interface UpsertLocalSessionInput {
  id?: string
  title?: string
  status?: LocalSessionStatus
  messages?: UIMessage[]
  lastMessagedAt?: number
  metadata?: unknown
}

export interface CreateGoalInput {
  id?: string
  sessionId?: string
  prompt: string
  status?: LocalGoalStatus
  metadata?: unknown
  queueItems?: GoalQueueItemInput[]
}

export interface GoalQueueItemInput {
  id?: string
  orderIndex?: number
  title: string
  status?: LocalGoalQueueStatus
  attempts?: number
  maxAttempts?: number
  sourceUrl?: string
  artifactPath?: string
  metadata?: unknown
  evidence?: unknown
  error?: string
}

export interface UpsertGoalQueueItemInput extends GoalQueueItemInput {
  goalRunId: string
}

export interface UpdateGoalQueueItemInput {
  status?: LocalGoalQueueStatus
  attempts?: number
  maxAttempts?: number
  sourceUrl?: string | null
  artifactPath?: string | null
  metadata?: unknown
  evidence?: unknown
  error?: string | null
}

export interface GoalCheckpointInput {
  id?: string
  goalRunId: string
  type: string
  summary: string
  state?: unknown
}

export interface AuditEventInput {
  id?: string
  sessionId?: string
  goalRunId?: string
  type: string
  summary: string
  payload?: unknown
}

const MAX_LOCAL_SESSIONS = 500

function parseJson(value: string | null): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

function getMessageRole(message: UIMessage): string {
  return typeof message.role === 'string' ? message.role : 'unknown'
}

function getMessageId(
  sessionId: string,
  message: UIMessage,
  orderIndex: number,
): string {
  const id = (message as { id?: unknown }).id
  return typeof id === 'string' && id.trim() ? id : `${sessionId}:${orderIndex}`
}

function titleFromMessages(messages: UIMessage[]): string | undefined {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) return undefined

  const text = firstUserMessage.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim()

  if (!text) return undefined
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function rowToSession(
  row: LocalSessionRow,
  messageRows: LocalSessionMessageRow[],
): LocalSession {
  return {
    id: row.id,
    title: row.title ?? undefined,
    status: row.status,
    messages: messageRows
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((messageRow) => JSON.parse(messageRow.messageJson) as UIMessage),
    lastMessagedAt: row.lastMessagedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    metadata: parseJson(row.metadataJson),
  }
}

function rowToGoal(row: LocalGoalRunRow): LocalGoalRun {
  return {
    id: row.id,
    sessionId: row.sessionId ?? undefined,
    prompt: row.prompt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    metadata: parseJson(row.metadataJson),
    queue: [],
    checkpoints: [],
  }
}

function rowToGoalQueueItem(row: LocalGoalQueueItemRow): LocalGoalQueueItem {
  return {
    id: row.id,
    goalRunId: row.goalRunId,
    orderIndex: row.orderIndex,
    title: row.title,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    sourceUrl: row.sourceUrl ?? undefined,
    artifactPath: row.artifactPath ?? undefined,
    metadata: parseJson(row.metadataJson),
    evidence: parseJson(row.evidenceJson),
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function rowToGoalCheckpoint(row: LocalGoalCheckpointRow): LocalGoalCheckpoint {
  return {
    id: row.id,
    goalRunId: row.goalRunId,
    type: row.type,
    summary: row.summary,
    state: parseJson(row.stateJson),
    createdAt: row.createdAt,
  }
}

function rowToAuditEvent(row: LocalAuditEventRow): LocalAuditEvent {
  return {
    id: row.id,
    sessionId: row.sessionId ?? undefined,
    goalRunId: row.goalRunId ?? undefined,
    type: row.type,
    summary: row.summary,
    payload: parseJson(row.payloadJson),
    createdAt: row.createdAt,
  }
}

export class LocalSessionService {
  private readonly db: BrowserOsDatabase

  constructor(options: { db?: BrowserOsDatabase } = {}) {
    this.db = options.db ?? getDb()
  }

  listSessions(): LocalSession[] {
    const sessionRows = this.db
      .select()
      .from(localSessions)
      .orderBy(desc(localSessions.lastMessagedAt))
      .limit(MAX_LOCAL_SESSIONS)
      .all()

    if (sessionRows.length === 0) return []

    const ids = sessionRows.map((session) => session.id)
    const messageRows = this.db
      .select()
      .from(localSessionMessages)
      .where(inArray(localSessionMessages.sessionId, ids))
      .orderBy(asc(localSessionMessages.orderIndex))
      .all()

    const messagesBySession = new Map<string, LocalSessionMessageRow[]>()
    for (const message of messageRows) {
      const current = messagesBySession.get(message.sessionId) ?? []
      current.push(message)
      messagesBySession.set(message.sessionId, current)
    }

    return sessionRows.map((session) =>
      rowToSession(session, messagesBySession.get(session.id) ?? []),
    )
  }

  getSession(id: string): LocalSession | null {
    const session = this.db
      .select()
      .from(localSessions)
      .where(eq(localSessions.id, id))
      .get()

    if (!session) return null

    const messages = this.db
      .select()
      .from(localSessionMessages)
      .where(eq(localSessionMessages.sessionId, id))
      .orderBy(asc(localSessionMessages.orderIndex))
      .all()

    return rowToSession(session, messages)
  }

  private ensureSessionRow(id: string, now = Date.now()): void {
    this.db
      .insert(localSessions)
      .values({
        id,
        title: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastMessagedAt: now,
        metadataJson: null,
      })
      .onConflictDoNothing()
      .run()
  }

  upsertSession(input: UpsertLocalSessionInput): LocalSession {
    const id = input.id?.trim() || crypto.randomUUID()
    const now = Date.now()
    const existing = this.db
      .select()
      .from(localSessions)
      .where(eq(localSessions.id, id))
      .get()

    const messages = input.messages
    const lastMessagedAt = input.lastMessagedAt ?? now
    const title = input.title ?? (messages ? titleFromMessages(messages) : null)

    this.db.transaction((tx) => {
      tx.insert(localSessions)
        .values({
          id,
          title,
          status: input.status ?? 'active',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          lastMessagedAt,
          metadataJson: stringifyJson(input.metadata),
        })
        .onConflictDoUpdate({
          target: localSessions.id,
          set: {
            title: title ?? existing?.title ?? null,
            status: input.status ?? existing?.status ?? 'active',
            updatedAt: now,
            lastMessagedAt,
            metadataJson:
              input.metadata === undefined
                ? (existing?.metadataJson ?? null)
                : stringifyJson(input.metadata),
          },
        })
        .run()

      if (messages) {
        tx.delete(localSessionMessages)
          .where(eq(localSessionMessages.sessionId, id))
          .run()

        if (messages.length > 0) {
          tx.insert(localSessionMessages)
            .values(
              messages.map((message, orderIndex) => ({
                id: getMessageId(id, message, orderIndex),
                sessionId: id,
                role: getMessageRole(message),
                orderIndex,
                messageJson: JSON.stringify(message),
                createdAt: now,
                updatedAt: now,
              })),
            )
            .run()
        }
      }
    })

    const session = this.getSession(id)
    if (!session) throw new Error(`Failed to load local session ${id}`)
    return session
  }

  appendMessages(sessionId: string, messages: UIMessage[]): LocalSession {
    const existing = this.getSession(sessionId)
    const merged = [...(existing?.messages ?? []), ...messages]
    return this.upsertSession({
      id: sessionId,
      messages: merged,
      title: existing?.title,
      status: existing?.status,
      metadata: existing?.metadata,
    })
  }

  deleteSession(id: string): boolean {
    const existed = !!this.db
      .select({ id: localSessions.id })
      .from(localSessions)
      .where(eq(localSessions.id, id))
      .get()

    if (!existed) return false

    this.db.delete(localSessions).where(eq(localSessions.id, id)).run()
    return true
  }

  getAuditEvents(sessionId: string): LocalAuditEvent[] {
    return this.db
      .select()
      .from(localAuditEvents)
      .where(eq(localAuditEvents.sessionId, sessionId))
      .orderBy(asc(localAuditEvents.createdAt))
      .all()
      .map(rowToAuditEvent)
  }

  recordAuditEvent(input: AuditEventInput): LocalAuditEvent {
    const now = Date.now()
    const id = input.id?.trim() || crypto.randomUUID()
    if (input.sessionId) this.ensureSessionRow(input.sessionId, now)

    this.db
      .insert(localAuditEvents)
      .values({
        id,
        sessionId: input.sessionId ?? null,
        goalRunId: input.goalRunId ?? null,
        type: input.type,
        summary: input.summary,
        payloadJson: stringifyJson(input.payload),
        createdAt: now,
      })
      .run()

    const row = this.db
      .select()
      .from(localAuditEvents)
      .where(eq(localAuditEvents.id, id))
      .get()

    if (!row) throw new Error(`Failed to load audit event ${id}`)
    return rowToAuditEvent(row)
  }

  private createQueueItemId(
    preferredId: string | undefined,
    seen: Set<string>,
  ) {
    const base = preferredId?.trim()
    if (!base) {
      const id = crypto.randomUUID()
      seen.add(id)
      return id
    }

    let candidate = base
    while (
      seen.has(candidate) ||
      this.db
        .select({ id: localGoalQueueItems.id })
        .from(localGoalQueueItems)
        .where(eq(localGoalQueueItems.id, candidate))
        .get()
    ) {
      candidate = `${base}-${crypto.randomUUID()}`
    }
    seen.add(candidate)
    return candidate
  }

  createGoal(input: CreateGoalInput): LocalGoalRun {
    const now = Date.now()
    const id = input.id?.trim() || crypto.randomUUID()
    if (input.sessionId) this.ensureSessionRow(input.sessionId, now)

    this.db.transaction((tx) => {
      tx.insert(localGoalRuns)
        .values({
          id,
          sessionId: input.sessionId ?? null,
          prompt: input.prompt,
          status: input.status ?? 'paused',
          createdAt: now,
          updatedAt: now,
          metadataJson: stringifyJson(input.metadata),
        })
        .run()

      if (input.queueItems?.length) {
        const seenQueueItemIds = new Set<string>()
        tx.insert(localGoalQueueItems)
          .values(
            input.queueItems.map((item, orderIndex) => ({
              id: this.createQueueItemId(item.id, seenQueueItemIds),
              goalRunId: id,
              orderIndex: item.orderIndex ?? orderIndex,
              title: item.title,
              status: item.status ?? 'pending',
              attempts: item.attempts ?? 0,
              maxAttempts: item.maxAttempts ?? 3,
              sourceUrl: item.sourceUrl ?? null,
              artifactPath: item.artifactPath ?? null,
              metadataJson: stringifyJson(item.metadata),
              evidenceJson: stringifyJson(item.evidence),
              error: item.error ?? null,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run()
      }
    })

    this.recordAuditEvent({
      sessionId: input.sessionId,
      goalRunId: id,
      type: 'goal.created',
      summary: 'Goal run created',
      payload: {
        prompt: input.prompt,
        status: input.status ?? 'paused',
        queueItems: input.queueItems?.length ?? 0,
      },
    })

    const goal = this.getGoal(id)
    if (!goal) throw new Error(`Failed to load goal run ${id}`)
    return goal
  }

  private hydrateGoal(row: LocalGoalRunRow): LocalGoalRun {
    const goal = rowToGoal(row)
    goal.queue = this.listGoalQueueItems(row.id)
    goal.checkpoints = this.listGoalCheckpoints(row.id)
    return goal
  }

  listGoalRuns(statuses?: LocalGoalStatus[]): LocalGoalRun[] {
    const rows =
      statuses && statuses.length > 0
        ? this.db
            .select()
            .from(localGoalRuns)
            .where(inArray(localGoalRuns.status, statuses))
            .orderBy(asc(localGoalRuns.updatedAt))
            .all()
        : this.db
            .select()
            .from(localGoalRuns)
            .orderBy(asc(localGoalRuns.updatedAt))
            .all()

    return rows.map((row) => this.hydrateGoal(row))
  }

  getGoal(id: string): LocalGoalRun | null {
    const row = this.db
      .select()
      .from(localGoalRuns)
      .where(eq(localGoalRuns.id, id))
      .get()
    return row ? this.hydrateGoal(row) : null
  }

  updateGoalStatus(id: string, status: LocalGoalStatus): LocalGoalRun | null {
    const now = Date.now()
    const completedAt =
      status === 'completed' || status === 'cancelled' || status === 'blocked'
        ? now
        : null

    this.db
      .update(localGoalRuns)
      .set({
        status,
        updatedAt: now,
        completedAt,
      })
      .where(eq(localGoalRuns.id, id))
      .run()

    const goal = this.getGoal(id)
    if (goal) {
      this.recordAuditEvent({
        sessionId: goal.sessionId,
        goalRunId: id,
        type: `goal.${status}`,
        summary: `Goal run ${status}`,
      })
    }
    return goal
  }

  listGoalQueueItems(goalRunId: string): LocalGoalQueueItem[] {
    return this.db
      .select()
      .from(localGoalQueueItems)
      .where(eq(localGoalQueueItems.goalRunId, goalRunId))
      .orderBy(asc(localGoalQueueItems.orderIndex))
      .all()
      .map(rowToGoalQueueItem)
  }

  upsertGoalQueueItem(input: UpsertGoalQueueItemInput): LocalGoalQueueItem {
    const now = Date.now()
    let id = input.id?.trim() || crypto.randomUUID()
    let existing = this.db
      .select()
      .from(localGoalQueueItems)
      .where(eq(localGoalQueueItems.id, id))
      .get()
    if (existing && existing.goalRunId !== input.goalRunId) {
      id = this.createQueueItemId(id, new Set())
      existing = undefined
    }

    this.db
      .insert(localGoalQueueItems)
      .values({
        id,
        goalRunId: input.goalRunId,
        orderIndex: input.orderIndex ?? existing?.orderIndex ?? now,
        title: input.title,
        status: input.status ?? existing?.status ?? 'pending',
        attempts: input.attempts ?? existing?.attempts ?? 0,
        maxAttempts: input.maxAttempts ?? existing?.maxAttempts ?? 3,
        sourceUrl: input.sourceUrl ?? existing?.sourceUrl ?? null,
        artifactPath: input.artifactPath ?? existing?.artifactPath ?? null,
        metadataJson:
          input.metadata === undefined
            ? (existing?.metadataJson ?? null)
            : stringifyJson(input.metadata),
        evidenceJson:
          input.evidence === undefined
            ? (existing?.evidenceJson ?? null)
            : stringifyJson(input.evidence),
        error: input.error ?? existing?.error ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: localGoalQueueItems.id,
        set: {
          goalRunId: input.goalRunId,
          orderIndex: input.orderIndex ?? existing?.orderIndex ?? now,
          title: input.title,
          status: input.status ?? existing?.status ?? 'pending',
          attempts: input.attempts ?? existing?.attempts ?? 0,
          maxAttempts: input.maxAttempts ?? existing?.maxAttempts ?? 3,
          sourceUrl: input.sourceUrl ?? existing?.sourceUrl ?? null,
          artifactPath: input.artifactPath ?? existing?.artifactPath ?? null,
          metadataJson:
            input.metadata === undefined
              ? (existing?.metadataJson ?? null)
              : stringifyJson(input.metadata),
          evidenceJson:
            input.evidence === undefined
              ? (existing?.evidenceJson ?? null)
              : stringifyJson(input.evidence),
          error: input.error ?? existing?.error ?? null,
          updatedAt: now,
        },
      })
      .run()

    const row = this.db
      .select()
      .from(localGoalQueueItems)
      .where(eq(localGoalQueueItems.id, id))
      .get()
    if (!row) throw new Error(`Failed to load goal queue item ${id}`)
    return rowToGoalQueueItem(row)
  }

  updateGoalQueueItem(
    goalRunId: string,
    itemId: string,
    input: UpdateGoalQueueItemInput,
  ): LocalGoalQueueItem | null {
    const row = this.db
      .select()
      .from(localGoalQueueItems)
      .where(eq(localGoalQueueItems.id, itemId))
      .get()
    if (!row || row.goalRunId !== goalRunId) return null

    const now = Date.now()
    this.db
      .update(localGoalQueueItems)
      .set({
        status: input.status ?? row.status,
        attempts: input.attempts ?? row.attempts,
        maxAttempts: input.maxAttempts ?? row.maxAttempts,
        sourceUrl:
          input.sourceUrl === undefined ? row.sourceUrl : input.sourceUrl,
        artifactPath:
          input.artifactPath === undefined
            ? row.artifactPath
            : input.artifactPath,
        metadataJson:
          input.metadata === undefined
            ? row.metadataJson
            : stringifyJson(input.metadata),
        evidenceJson:
          input.evidence === undefined
            ? row.evidenceJson
            : stringifyJson(input.evidence),
        error: input.error === undefined ? row.error : input.error,
        updatedAt: now,
      })
      .where(eq(localGoalQueueItems.id, itemId))
      .run()

    const updated = this.db
      .select()
      .from(localGoalQueueItems)
      .where(eq(localGoalQueueItems.id, itemId))
      .get()
    return updated ? rowToGoalQueueItem(updated) : null
  }

  listGoalCheckpoints(goalRunId: string): LocalGoalCheckpoint[] {
    return this.db
      .select()
      .from(localGoalCheckpoints)
      .where(eq(localGoalCheckpoints.goalRunId, goalRunId))
      .orderBy(asc(localGoalCheckpoints.createdAt))
      .all()
      .map(rowToGoalCheckpoint)
  }

  recordGoalCheckpoint(input: GoalCheckpointInput): LocalGoalCheckpoint {
    const now = Date.now()
    const id = input.id?.trim() || crypto.randomUUID()

    this.db
      .insert(localGoalCheckpoints)
      .values({
        id,
        goalRunId: input.goalRunId,
        type: input.type,
        summary: input.summary,
        stateJson: stringifyJson(input.state),
        createdAt: now,
      })
      .run()

    const row = this.db
      .select()
      .from(localGoalCheckpoints)
      .where(eq(localGoalCheckpoints.id, id))
      .get()

    if (!row) throw new Error(`Failed to load goal checkpoint ${id}`)
    return rowToGoalCheckpoint(row)
  }
}
