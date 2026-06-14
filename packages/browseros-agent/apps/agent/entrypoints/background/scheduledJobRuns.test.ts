import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ChatMode } from '@/entrypoints/sidepanel/index/chatTypes'
import type {
  ScheduledJob,
  ScheduledJobRun,
} from '@/lib/schedules/scheduleTypes'

const originalChrome = globalThis.chrome

let jobs: ScheduledJob[] = []
let runs: ScheduledJobRun[] = []
let runScheduledJobHandler:
  | ((message: { data: { jobId: string } }) => Promise<unknown>)
  | undefined
let capturedChatRequest: { message: string; mode?: ChatMode } | undefined

mock.module('@/lib/messaging/schedules/scheduleMessages', () => ({
  onScheduleMessage: (
    name: string,
    handler: (message: { data: { jobId: string } }) => Promise<unknown>,
  ) => {
    if (name === 'runScheduledJob') {
      runScheduledJobHandler = handler
    }
  },
}))

mock.module('@/lib/schedules/createAlarmFromJob', () => ({
  createAlarmFromJob: async () => {},
}))

mock.module('@/lib/schedules/getChatServerResponse', () => ({
  getChatServerResponse: mock(
    async (request: { message: string; mode?: ChatMode }) => {
      capturedChatRequest = {
        message: request.message,
        mode: request.mode,
      }
      return {
        text: 'done',
        conversationId: 'conversation-1',
        finalResult: 'done',
        executionLog: 'done',
        toolCalls: [],
      }
    },
  ),
}))

mock.module('@/lib/schedules/scheduleStorage', () => ({
  scheduledJobRunStorage: {
    getValue: async () => runs,
    setValue: async (value: ScheduledJobRun[]) => {
      runs = value
    },
  },
  scheduledJobStorage: {
    getValue: async () => jobs,
    setValue: async (value: ScheduledJob[]) => {
      jobs = value
    },
  },
}))

beforeEach(() => {
  runScheduledJobHandler = undefined
  capturedChatRequest = undefined
  runs = []
  jobs = [
    {
      id: 'job-1',
      name: 'Scheduled research',
      query: 'Research the latest local notes',
      mode: 'research',
      scheduleType: 'daily',
      scheduleTime: '09:00',
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]
  globalThis.chrome = {
    alarms: {
      get: async () => undefined,
      clear: async () => true,
      create: async () => {},
      onAlarm: {
        addListener: () => {},
      },
    },
    runtime: {
      onStartup: {
        addListener: () => {},
      },
      onInstalled: {
        addListener: () => {},
      },
    },
  } as unknown as typeof chrome
})

afterEach(() => {
  globalThis.chrome = originalChrome
})

describe('scheduledJobRuns', () => {
  it('passes the stored scheduled task mode into the local chat request', async () => {
    const { scheduledJobRuns } = await import('./scheduledJobRuns')

    await scheduledJobRuns()
    expect(runScheduledJobHandler).toBeDefined()

    const result = await runScheduledJobHandler?.({
      data: { jobId: 'job-1' },
    })

    expect(result).toEqual({ success: true })
    expect(capturedChatRequest).toEqual({
      message: 'Research the latest local notes',
      mode: 'research',
    })
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('completed')
    expect(jobs[0].lastRunAt).toBeDefined()
  })
})
