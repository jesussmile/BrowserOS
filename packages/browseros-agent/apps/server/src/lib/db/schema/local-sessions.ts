/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const localSessions = sqliteTable(
  'local_sessions',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    lastMessagedAt: integer('last_messaged_at').notNull(),
    metadataJson: text('metadata_json'),
  },
  (table) => [
    index('local_sessions_last_messaged_at_idx').on(table.lastMessagedAt),
    index('local_sessions_updated_at_idx').on(table.updatedAt),
    index('local_sessions_status_updated_at_idx').on(
      table.status,
      table.updatedAt,
    ),
  ],
)

export const localSessionMessages = sqliteTable(
  'local_session_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => localSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    orderIndex: integer('order_index').notNull(),
    messageJson: text('message_json').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('local_session_messages_session_order_unique').on(
      table.sessionId,
      table.orderIndex,
    ),
    index('local_session_messages_session_idx').on(table.sessionId),
  ],
)

export const localGoalRuns = sqliteTable(
  'local_goal_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => localSessions.id, {
      onDelete: 'set null',
    }),
    prompt: text('prompt').notNull(),
    status: text('status', {
      enum: ['running', 'paused', 'completed', 'cancelled', 'blocked'],
    })
      .notNull()
      .default('paused'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    completedAt: integer('completed_at'),
    metadataJson: text('metadata_json'),
  },
  (table) => [
    index('local_goal_runs_session_idx').on(table.sessionId),
    index('local_goal_runs_status_updated_at_idx').on(
      table.status,
      table.updatedAt,
    ),
  ],
)

export const localGoalQueueItems = sqliteTable(
  'local_goal_queue_items',
  {
    id: text('id').primaryKey(),
    goalRunId: text('goal_run_id')
      .notNull()
      .references(() => localGoalRuns.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    title: text('title').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'skipped', 'failed', 'blocked'],
    })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    sourceUrl: text('source_url'),
    artifactPath: text('artifact_path'),
    metadataJson: text('metadata_json'),
    evidenceJson: text('evidence_json'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('local_goal_queue_items_goal_order_unique').on(
      table.goalRunId,
      table.orderIndex,
    ),
    index('local_goal_queue_items_goal_status_idx').on(
      table.goalRunId,
      table.status,
    ),
  ],
)

export const localGoalCheckpoints = sqliteTable(
  'local_goal_checkpoints',
  {
    id: text('id').primaryKey(),
    goalRunId: text('goal_run_id')
      .notNull()
      .references(() => localGoalRuns.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    summary: text('summary').notNull(),
    stateJson: text('state_json'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('local_goal_checkpoints_goal_created_idx').on(
      table.goalRunId,
      table.createdAt,
    ),
  ],
)

export const localAuditEvents = sqliteTable(
  'local_audit_events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => localSessions.id, {
      onDelete: 'cascade',
    }),
    goalRunId: text('goal_run_id').references(() => localGoalRuns.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    summary: text('summary').notNull(),
    payloadJson: text('payload_json'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('local_audit_events_session_created_idx').on(
      table.sessionId,
      table.createdAt,
    ),
    index('local_audit_events_goal_created_idx').on(
      table.goalRunId,
      table.createdAt,
    ),
  ],
)

export type LocalSessionRow = InferSelectModel<typeof localSessions>
export type NewLocalSessionRow = InferInsertModel<typeof localSessions>
export type LocalSessionMessageRow = InferSelectModel<
  typeof localSessionMessages
>
export type NewLocalSessionMessageRow = InferInsertModel<
  typeof localSessionMessages
>
export type LocalGoalRunRow = InferSelectModel<typeof localGoalRuns>
export type NewLocalGoalRunRow = InferInsertModel<typeof localGoalRuns>
export type LocalGoalQueueItemRow = InferSelectModel<typeof localGoalQueueItems>
export type NewLocalGoalQueueItemRow = InferInsertModel<
  typeof localGoalQueueItems
>
export type LocalGoalCheckpointRow = InferSelectModel<
  typeof localGoalCheckpoints
>
export type NewLocalGoalCheckpointRow = InferInsertModel<
  typeof localGoalCheckpoints
>
export type LocalAuditEventRow = InferSelectModel<typeof localAuditEvents>
export type NewLocalAuditEventRow = InferInsertModel<typeof localAuditEvents>
