import { afterEach, describe, expect, it, mock } from 'bun:test'

mock.module('../browseros/helpers', () => ({
  getAgentServerUrl: async () => 'http://127.0.0.1:5151',
}))

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('goalLoopClient', () => {
  it('plans, runs, pauses, and reads progress through local Goal Loop routes', async () => {
    const {
      getGoalLoopProgress,
      pauseGoalLoop,
      planGoalLoop,
      resumeGoalLoopStatus,
      runGoalLoop,
    } = await import('./goalLoopClient')
    const requests: Array<{ url: string; body?: unknown }> = []
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requests.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })

        if (url.endsWith('/local/goals/plan')) {
          return jsonResponse({
            goal: {
              id: 'goal-1',
              prompt: 'Read page',
              status: 'paused',
              queue: [],
            },
          })
        }

        if (url.endsWith('/local/goals/goal-1/run')) {
          return jsonResponse({
            run: {
              goal: {
                id: 'goal-1',
                prompt: 'Read page',
                status: 'completed',
                queue: [],
              },
              status: 'completed',
              processedItems: 1,
            },
          })
        }

        if (url.endsWith('/local/goals/goal-1/pause')) {
          return jsonResponse({
            goal: {
              id: 'goal-1',
              prompt: 'Read page',
              status: 'paused',
              queue: [],
            },
          })
        }

        if (url.endsWith('/local/goals/goal-1/resume')) {
          return jsonResponse({
            goal: {
              id: 'goal-1',
              prompt: 'Read page',
              status: 'running',
              queue: [],
            },
          })
        }

        if (url.endsWith('/local/goals/goal-1/progress')) {
          return jsonResponse({
            progress: {
              goalRunId: 'goal-1',
              prompt: 'Read page',
              status: 'completed',
              queueCounts: {
                pending: 0,
                running: 0,
                completed: 1,
                skipped: 0,
                failed: 0,
                blocked: 0,
              },
              retryCount: 1,
            },
          })
        }

        return new Response(null, { status: 404 })
      },
    ) as unknown as typeof fetch

    await expect(
      planGoalLoop({
        sessionId: 'conversation-1',
        prompt: 'Read page',
        queueItems: [
          {
            title: 'Read page',
            sourceUrl: 'https://example.test',
            metadata: { action: 'read', risk: 'low' },
          },
        ],
      }),
    ).resolves.toMatchObject({ id: 'goal-1' })
    await expect(runGoalLoop('goal-1', { maxItems: 1 })).resolves.toMatchObject(
      {
        status: 'completed',
      },
    )
    await expect(pauseGoalLoop('goal-1')).resolves.toMatchObject({
      status: 'paused',
    })
    await expect(resumeGoalLoopStatus('goal-1')).resolves.toMatchObject({
      status: 'running',
    })
    await expect(getGoalLoopProgress('goal-1')).resolves.toMatchObject({
      goalRunId: 'goal-1',
      queueCounts: { completed: 1 },
    })

    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:5151/local/goals/plan',
        body: {
          sessionId: 'conversation-1',
          prompt: 'Read page',
          queueItems: [
            {
              title: 'Read page',
              sourceUrl: 'https://example.test',
              metadata: { action: 'read', risk: 'low' },
            },
          ],
        },
      },
      {
        url: 'http://127.0.0.1:5151/local/goals/goal-1/run',
        body: { maxItems: 1 },
      },
      {
        url: 'http://127.0.0.1:5151/local/goals/goal-1/pause',
      },
      {
        url: 'http://127.0.0.1:5151/local/goals/goal-1/resume',
        body: { grantBlockedApproval: true },
      },
      {
        url: 'http://127.0.0.1:5151/local/goals/goal-1/progress',
      },
    ])
  })

  it('can request a server-owned background Goal Loop run', async () => {
    const { runGoalLoop } = await import('./goalLoopClient')
    const requests: Array<{ url: string; body?: unknown }> = []
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        requests.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })

        if (url.endsWith('/local/goals/goal-1/run')) {
          return jsonResponse({
            run: {
              goal: {
                id: 'goal-1',
                prompt: 'Read page',
                status: 'running',
                queue: [],
              },
              status: 'running',
              processedItems: 0,
              background: {
                started: true,
              },
            },
          })
        }

        return new Response(null, { status: 404 })
      },
    ) as unknown as typeof fetch

    await expect(
      runGoalLoop('goal-1', {
        resumeReason: 'ui_auto_continue',
        background: true,
      }),
    ).resolves.toMatchObject({
      status: 'running',
      background: {
        started: true,
      },
    })

    expect(requests).toEqual([
      {
        url: 'http://127.0.0.1:5151/local/goals/goal-1/run',
        body: {
          resumeReason: 'ui_auto_continue',
          background: true,
        },
      },
    ])
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
