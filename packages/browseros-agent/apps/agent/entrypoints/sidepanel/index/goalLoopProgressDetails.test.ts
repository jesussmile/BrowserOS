import { describe, expect, it } from 'bun:test'
import type { GoalLoopProgress } from '@/lib/goals/goalLoopClient'
import {
  getGoalLoopProgressChips,
  getGoalLoopResumePrompt,
  getGoalLoopResumePromptPreview,
} from './goalLoopProgressDetails'

const baseProgress = (
  overrides: Partial<GoalLoopProgress> = {},
): GoalLoopProgress => ({
  goalRunId: 'goal-1',
  status: 'running',
  lifecycleStatus: 'running',
  prompt: 'Download charts',
  queueCounts: {
    pending: 2,
    running: 1,
    completed: 3,
    skipped: 0,
    failed: 0,
    blocked: 0,
  },
  retryCount: 1,
  ...overrides,
})

describe('goal loop progress details', () => {
  it('summarizes worker, lock, compaction, and resume state as chips', () => {
    const chips = getGoalLoopProgressChips(
      baseProgress({
        workerStatus: {
          mode: 'auto',
          activeWorkers: 2,
          maxWorkers: 3,
        },
        lockStatus: {
          browserMutationLocked: true,
          lockedByItemId: 'item-7',
        },
        continuation: {
          count: 1,
          lastCompactedAt: Date.UTC(2026, 5, 4, 18, 5),
          packet: {
            version: 1,
            goalRunId: 'goal-1',
            generatedAt: Date.UTC(2026, 5, 4, 18, 5),
            reason: 'manual_resume',
            objective: 'Download charts',
            constraints: ['local only'],
            approvalScope: {
              autoApprove: ['read'],
              pauseFor: ['login'],
            },
            queueCounts: baseProgress().queueCounts,
            completedItems: [],
            pendingItems: [],
            blockedItems: [],
            failedItems: [],
            artifacts: [],
            nextAction: 'Continue pending queue',
            resumePrompt: 'Resume downloading the remaining chart PDFs.',
          },
        },
      }),
    )

    expect(chips).toContain('Workers auto 2/3')
    expect(chips).toContain('Mutation lock item-7')
    expect(chips.some((chip) => chip.startsWith('Compacted '))).toBe(true)
    expect(chips).toContain('Resume prompt ready')
  })

  it('prefers top-level resume prompt and returns a compact preview', () => {
    const progress = baseProgress({
      resumePrompt:
        'Continue from the local SQLite queue.\nUse the next pending item.',
      continuation: {
        count: 1,
        packet: {
          version: 1,
          goalRunId: 'goal-1',
          generatedAt: 0,
          reason: 'manual_resume',
          objective: 'Old objective',
          constraints: [],
          approvalScope: { autoApprove: [], pauseFor: [] },
          queueCounts: baseProgress().queueCounts,
          completedItems: [],
          pendingItems: [],
          blockedItems: [],
          failedItems: [],
          artifacts: [],
          nextAction: 'Old next action',
          resumePrompt: 'Older packet prompt.',
        },
      },
    })

    expect(getGoalLoopResumePrompt(progress)).toBe(
      'Continue from the local SQLite queue.\nUse the next pending item.',
    )
    expect(getGoalLoopResumePromptPreview(progress)).toBe(
      'Continue from the local SQLite queue.',
    )
  })
})
