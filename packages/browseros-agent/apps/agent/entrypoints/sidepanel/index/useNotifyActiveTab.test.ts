import { describe, expect, it } from 'bun:test'
import type { GoalLoopProgress } from '@/lib/goals/goalLoopClient'
import {
  getGoalLoopCurrentSourceUrl,
  normalizeTabUrlForGoalLoop,
  shouldShowGoalLoopTabMarker,
} from './goalLoopTabMarker'

const progress = (overrides: Partial<GoalLoopProgress>): GoalLoopProgress => ({
  goalRunId: 'goal-1',
  status: 'running',
  prompt: 'Read pages',
  queueCounts: {
    pending: 0,
    running: 1,
    completed: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
  },
  retryCount: 0,
  ...overrides,
})

describe('Goal Loop active-tab marker helpers', () => {
  it('shows the marker for active Goal Loop work states', () => {
    for (const lifecycleStatus of [
      'running',
      'resuming',
      'compacting',
    ] as const) {
      expect(
        shouldShowGoalLoopTabMarker(
          progress({ lifecycleStatus, queueCounts: progress({}).queueCounts }),
        ),
      ).toBe(true)
    }
  })

  it('clears the marker for inactive terminal or paused Goal Loop states', () => {
    for (const status of [
      'paused',
      'blocked',
      'completed',
      'cancelled',
    ] as const) {
      expect(
        shouldShowGoalLoopTabMarker(
          progress({
            status,
            lifecycleStatus: status === 'completed' ? 'complete' : status,
            queueCounts: {
              pending: 0,
              running: 0,
              completed: status === 'completed' ? 1 : 0,
              skipped: 0,
              failed: 0,
              blocked: status === 'blocked' ? 1 : 0,
            },
          }),
        ),
      ).toBe(false)
    }
  })

  it('uses the current queue item source URL for tab matching', () => {
    expect(
      getGoalLoopCurrentSourceUrl(
        progress({
          currentItem: {
            id: 'item-1',
            title: 'Read Example',
            status: 'running',
            attempts: 1,
            maxAttempts: 3,
            sourceUrl: 'https://example.com/page',
          },
        }),
      ),
    ).toBe('https://example.com/page')
  })

  it('normalizes URL hashes so same-page tabs still match', () => {
    expect(normalizeTabUrlForGoalLoop('https://example.com/path#section')).toBe(
      'https://example.com/path',
    )
  })
})
