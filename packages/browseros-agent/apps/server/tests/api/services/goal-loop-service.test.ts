/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import {
  type GoalLoopExecutionContext,
  type GoalLoopExecutorResult,
  GoalLoopService,
} from '../../../src/api/services/goal-loop-service'
import { LocalSessionService } from '../../../src/api/services/local-session-service'
import { closeDb, initializeDb } from '../../../src/lib/db'

describe('GoalLoopService', () => {
  afterEach(() => {
    closeDb()
  })

  it('converts a prompt into a durable goal contract and queue', () => {
    const { loop } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-plan',
      prompt: [
        'Collect airport PDF charts',
        '- Open the approved source list',
        '- Download each PDF chart',
      ].join('\n'),
      retryLimit: 4,
    })

    expect(goal.status).toBe('paused')
    expect(goal.metadata).toMatchObject({
      goalLoopContract: {
        prompt: goal.prompt,
        retryLimit: 4,
        approvalScope: {
          autoApprove: expect.arrayContaining(['read', 'navigate', 'download']),
          pauseFor: expect.arrayContaining(['login', 'credential', 'upload']),
        },
      },
    })
    expect(goal.queue).toHaveLength(3)
    expect(goal.queue[0]).toMatchObject({
      title: 'Collect airport PDF charts',
      maxAttempts: 4,
      metadata: {
        action: 'download',
        risk: 'low',
      },
    })
  })

  it('expands explicit URL and comma-list prompts into separate queue items', () => {
    const { loop } = createLoop()

    const urlGoal = loop.createGoal({
      id: 'goal-url-plan',
      prompt:
        'Download these PDFs: https://example.test/one.pdf, https://example.test/two.pdf',
    })

    expect(urlGoal.queue).toEqual([
      expect.objectContaining({
        title: 'Download https://example.test/one.pdf',
        sourceUrl: 'https://example.test/one.pdf',
        metadata: expect.objectContaining({
          action: 'download',
          url: 'https://example.test/one.pdf',
        }),
      }),
      expect.objectContaining({
        title: 'Download https://example.test/two.pdf',
        sourceUrl: 'https://example.test/two.pdf',
        metadata: expect.objectContaining({
          action: 'download',
          url: 'https://example.test/two.pdf',
        }),
      }),
    ])

    const listGoal = loop.createGoal({
      id: 'goal-list-plan',
      prompt: 'Download airport charts for KJFK, KLAX, KORD',
    })

    expect(listGoal.queue.map((item) => item.title)).toEqual([
      'Download KJFK',
      'Download KLAX',
      'Download KORD',
    ])
  })

  it('keeps auth/chart completion prompts out of the OurAirports CSV shortcut', () => {
    const { loop } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-conditional-auth-plan',
      prompt:
        'wait for example for blocked countires if it requires login then register using user@example.test and thencreate a password if necessary and then go to gmail.com to activate the link of download etc not just google drive, it could be normal registration tooo and keep working until you process each and every countires and all the airports in the world all remaining blocked countries',
    })

    expect(goal.queue).toHaveLength(1)
    expect(goal.queue[0]).toMatchObject({
      title: 'Build durable source/work queue before executing broad goal',
      metadata: {
        requiresQueueExpansion: true,
        expansionReason: expect.stringContaining('needs a durable source list'),
      },
    })
    expect(goal.queue[0].metadata?.sourceKind).toBeUndefined()
    expect(goal.queue[0].metadata?.queueExpansion).toBeUndefined()
  })

  it('expands known credential/browser-download recovery goals into executable steps', async () => {
    const executed: string[] = []
    const { loop, local } = createLoop({
      execute: async ({ item }) => {
        executed.push(item.title)
        return {
          status: 'completed',
          evidence: { title: item.title },
        }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-eurocontrol-remaining-countries',
      prompt:
        'so here is the issue , lets do this instead for example we could still register to the website and login you can use eurocontrol the username is test-user and password is test-password and then try to download the remaining countries if eurocontrol is not sufficient then perhaps go to the appropriate website and register. after registering then login with the email and password and start downloading .',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
    })

    expect(goal.queue.map((item) => item.title)).toEqual([
      'Open Eurocontrol EAD Basic login',
      'Enter Eurocontrol username',
      'Enter Eurocontrol password',
      'Submit Eurocontrol login',
      'Read Eurocontrol post-login page and available download options',
    ])
    expect(goal.queue[1]).toMatchObject({
      metadata: {
        action: 'fill',
        risk: 'high',
        selector: 'User Name:',
        value: 'test-user',
      },
    })
    expect(goal.queue[2]).toMatchObject({
      metadata: {
        action: 'fill',
        risk: 'high',
        selector: 'Password:',
      },
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(result.manifest?.totals).toMatchObject({
      completed: 5,
      blocked: 0,
      pending: 0,
    })
    expect(executed).toEqual(goal.queue.map((item) => item.title))
    expect(local.getGoal(goal.id)).toMatchObject({
      status: 'completed',
    })
  })

  it('uses the OurAirports shortcut only for explicit airport CSV data goals', () => {
    const { loop } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-airport-csv-data-plan',
      prompt:
        'Create an airport CSV data export for every country in the world',
    })

    expect(goal.queue).toHaveLength(2)
    expect(goal.queue[0]).toMatchObject({
      metadata: {
        action: 'download',
        risk: 'low',
        sourceKind: 'ourairports-countries',
        downloadMode: 'url',
      },
    })
    expect(goal.queue[1]).toMatchObject({
      metadata: {
        action: 'download',
        risk: 'low',
        sourceKind: 'ourairports-airports',
        queueExpansion: 'ourairports-countries',
        downloadMode: 'url',
      },
    })
  })

  it('persists generated queue items returned by an executor', async () => {
    const { loop, local } = createLoop({
      execute: async ({ item }) => ({
        status: 'completed',
        evidence: { id: item.id },
        generatedQueueItems:
          item.id === 'source'
            ? [
                {
                  id: 'generated-us',
                  title: 'Process airports for United States (US)',
                  metadata: {
                    action: 'extract',
                    risk: 'low',
                    sourceKind: 'ourairports-country',
                    countryCode: 'US',
                    countryName: 'United States',
                  },
                },
              ]
            : undefined,
      }),
    })
    const goal = loop.createGoal({
      id: 'goal-generated-queue',
      prompt: 'Process airport source list',
      queueItems: [
        {
          id: 'source',
          title: 'Download airport source',
          metadata: { action: 'download', risk: 'low' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id, { maxItems: 1 })

    expect(result.status).toBe('running')
    expect(local.getGoal(goal.id)?.queue).toEqual([
      expect.objectContaining({
        id: 'source',
        status: 'completed',
      }),
      expect.objectContaining({
        id: 'generated-us',
        status: 'pending',
        metadata: expect.objectContaining({
          sourceKind: 'ourairports-country',
          countryCode: 'US',
        }),
      }),
    ])
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).toEqual(expect.arrayContaining(['queue.expanded', 'loop.compacted']))
  })

  it('infers per-URL actions from nearby natural-language instructions', () => {
    const { loop } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-mixed-url-plan',
      prompt:
        'Open and read https://example.test/ and https://iana.test/reserved, then download/save this public PDF: https://example.test/chart.pdf',
    })

    expect(goal.queue).toEqual([
      expect.objectContaining({
        title: 'Read https://example.test/',
        sourceUrl: 'https://example.test/',
        metadata: expect.objectContaining({
          action: 'read',
          url: 'https://example.test/',
        }),
      }),
      expect.objectContaining({
        title: 'Read https://iana.test/reserved',
        sourceUrl: 'https://iana.test/reserved',
        metadata: expect.objectContaining({
          action: 'read',
          url: 'https://iana.test/reserved',
        }),
      }),
      expect.objectContaining({
        title: 'Download https://example.test/chart.pdf',
        sourceUrl: 'https://example.test/chart.pdf',
        metadata: expect.objectContaining({
          action: 'download',
          url: 'https://example.test/chart.pdf',
        }),
      }),
    ])
  })

  it('keeps duplicate caller queue item ids from crashing separate goals', () => {
    const { loop } = createLoop()

    const first = loop.createGoal({
      id: 'goal-duplicate-one',
      prompt: 'Read example',
      queueItems: [
        {
          id: 'same-item-id',
          title: 'Read first',
          metadata: { action: 'read', risk: 'low' },
        },
      ],
    })
    const second = loop.createGoal({
      id: 'goal-duplicate-two',
      prompt: 'Read example again',
      queueItems: [
        {
          id: 'same-item-id',
          title: 'Read second',
          metadata: { action: 'read', risk: 'low' },
        },
      ],
    })

    expect(first.queue[0]?.id).toBe('same-item-id')
    expect(second.queue[0]?.id).toStartWith('same-item-id-')
    expect(second.queue[0]).toMatchObject({
      goalRunId: 'goal-duplicate-two',
      title: 'Read second',
    })
  })

  it('executes low-risk queue items continuously and writes a final manifest', async () => {
    const { loop, local } = createLoop({
      execute: async ({ item }) => ({
        status: 'completed',
        artifactPath: `downloads/${item.id}.pdf`,
        sourceUrl: item.sourceUrl,
        evidence: { bytes: 100 + item.orderIndex },
      }),
    })

    const goal = loop.createGoal({
      id: 'goal-run',
      prompt: 'Download approved airport charts',
      startImmediately: true,
      queueItems: [
        {
          id: 'kjfk',
          title: 'Download KJFK PDF',
          sourceUrl: 'https://example.test/kjfk.pdf',
          metadata: { action: 'download', risk: 'low' },
        },
        {
          id: 'klax',
          title: 'Download KLAX PDF',
          sourceUrl: 'https://example.test/klax.pdf',
          metadata: { action: 'download', risk: 'low' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(result.processedItems).toBe(2)
    expect(result.manifest).toMatchObject({
      totals: {
        completed: 2,
        skipped: 0,
        failed: 0,
        blocked: 0,
        pending: 0,
      },
      completed: [
        {
          id: 'kjfk',
          artifactPath: 'downloads/kjfk.pdf',
          sourceUrl: 'https://example.test/kjfk.pdf',
          attempts: 1,
        },
        {
          id: 'klax',
          artifactPath: 'downloads/klax.pdf',
          sourceUrl: 'https://example.test/klax.pdf',
          attempts: 1,
        },
      ],
    })

    const restored = local.getGoal(goal.id)
    expect(restored?.status).toBe('completed')
    expect(loop.getProgress(goal.id)).toMatchObject({
      lifecycleStatus: 'complete',
      continuation: undefined,
      resumePrompt: undefined,
    })
    expect(restored?.checkpoints.map((checkpoint) => checkpoint.type)).toEqual(
      expect.arrayContaining([
        'loop.planned',
        'loop.started',
        'item.completed',
        'manifest.final',
      ]),
    )
  })

  it('retries retryable item failures before completing the item', async () => {
    let calls = 0
    const { loop, local } = createLoop({
      execute: async () => {
        calls += 1
        if (calls === 1) {
          return {
            status: 'failed',
            retryable: true,
            error: 'temporary network failure',
          }
        }
        return {
          status: 'completed',
          evidence: { recovered: true },
        }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-retry',
      prompt: 'Download one chart',
      queueItems: [
        {
          id: 'retry-item',
          title: 'Download chart with retry',
          maxAttempts: 3,
          metadata: { action: 'download', risk: 'low' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(calls).toBe(2)
    expect(local.getGoal(goal.id)?.queue[0]).toMatchObject({
      status: 'completed',
      attempts: 2,
      evidence: { recovered: true },
    })
    expect(local.getGoal(goal.id)?.queue[0]?.error).toBeUndefined()
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).toEqual(expect.arrayContaining(['loop.retry', 'item.completed']))
  })

  it('resumes pending work after a bounded run yields mid-goal', async () => {
    const completed: string[] = []
    const { loop, local } = createLoop({
      execute: async ({ item }) => {
        completed.push(item.id)
        return { status: 'completed', evidence: { id: item.id } }
      },
    })
    const goal = loop.createGoal({
      id: 'goal-resume',
      prompt: 'Process several queue items',
      queueItems: ['one', 'two', 'three'].map((id) => ({
        id,
        title: `Read item ${id}`,
        metadata: { action: 'read', risk: 'low' },
      })),
    })

    const firstRun = await loop.runGoal(goal.id, { maxItems: 1 })
    expect(firstRun.status).toBe('running')
    expect(firstRun.continuationPacket).toMatchObject({
      reason: 'pre_turn_limit',
      queueCounts: {
        completed: 1,
        pending: 2,
      },
      pendingItems: [
        expect.objectContaining({ id: 'two' }),
        expect.objectContaining({ id: 'three' }),
      ],
      nextAction: 'Continue with queue item "Read item two".',
    })
    expect(firstRun.continuationPacket?.resumePrompt).toContain(
      'Do not depend on visible chat history',
    )
    expect(completed).toEqual(['one'])
    expect(local.getGoal(goal.id)?.queue.map((item) => item.status)).toEqual([
      'completed',
      'pending',
      'pending',
    ])
    expect(loop.getProgress(goal.id)).toMatchObject({
      lifecycleStatus: 'compacting',
      continuation: {
        count: 1,
        packet: {
          reason: 'pre_turn_limit',
        },
      },
    })

    const resumedLoop = new GoalLoopService({
      service: local,
      executor: {
        execute: async ({ item }) => {
          completed.push(item.id)
          return { status: 'completed', evidence: { id: item.id } }
        },
      },
    })
    const resumed = await resumedLoop.runGoal(goal.id, {
      resumeReason: 'restart_resume',
    })

    expect(resumed.status).toBe('completed')
    expect(completed).toEqual(['one', 'two', 'three'])
    expect(resumed.manifest?.totals.completed).toBe(3)
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).toEqual(expect.arrayContaining(['loop.compacted', 'loop.resuming']))
  })

  it('uses auto strategy to parallelize larger independent queue batches', async () => {
    let active = 0
    let maxActive = 0
    let release: (() => void) | undefined
    let markAllStarted: (() => void) | undefined
    const allStarted = new Promise<void>((resolve) => {
      markAllStarted = resolve
    })
    const canFinish = new Promise<void>((resolve) => {
      release = resolve
    })
    const started: string[] = []
    const { loop } = createLoop({
      execute: async ({ item }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        started.push(item.id)
        if (started.length === 3) markAllStarted?.()
        await canFinish
        active -= 1
        return { status: 'completed', evidence: { id: item.id } }
      },
    })
    const goal = loop.createGoal({
      id: 'goal-auto-workers',
      prompt: 'Read three independent public pages',
      agentStrategy: { mode: 'auto', maxWorkers: 3 },
      queueItems: ['one', 'two', 'three'].map((id) => ({
        id,
        title: `Read ${id}`,
        metadata: { action: 'read', risk: 'low' },
      })),
    })

    const run = loop.runGoal(goal.id)
    await allStarted

    expect(started.sort()).toEqual(['one', 'three', 'two'])
    expect(maxActive).toBe(3)
    expect(loop.getProgress(goal.id)).toMatchObject({
      workerStatus: {
        mode: 'auto',
        maxWorkers: 3,
        activeWorkers: 3,
      },
    })

    release?.()
    const result = await run

    expect(result.status).toBe('completed')
    expect(result.processedItems).toBe(3)
  })

  it('keeps single-agent strategy sequential', async () => {
    let active = 0
    let maxActive = 0
    const order: string[] = []
    const { loop } = createLoop({
      execute: async ({ item }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(item.id)
        active -= 1
        return { status: 'completed', evidence: { id: item.id } }
      },
    })
    const goal = loop.createGoal({
      id: 'goal-single-worker',
      prompt: 'Read three pages in order',
      agentStrategy: { mode: 'single', maxWorkers: 3 },
      queueItems: ['one', 'two', 'three'].map((id) => ({
        id,
        title: `Read ${id}`,
        metadata: { action: 'read', risk: 'low' },
      })),
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(maxActive).toBe(1)
    expect(order).toEqual(['one', 'two', 'three'])
    expect(loop.getProgress(goal.id)?.workerStatus.maxWorkers).toBe(1)
  })

  it('serializes browser mutation actions behind a per-goal lock', async () => {
    let loop!: GoalLoopService
    let active = 0
    let maxActive = 0
    let releaseFirst: (() => void) | undefined
    let markFirstStarted: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const observedLocks: Array<unknown> = []
    const created = createLoop({
      execute: async ({ item }) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        observedLocks.push(loop.getProgress(item.goalRunId)?.lockStatus)
        if (item.id === 'nav-one') {
          markFirstStarted?.()
          await firstCanFinish
        }
        active -= 1
        return { status: 'completed', evidence: { id: item.id } }
      },
    })
    loop = created.loop
    const goal = loop.createGoal({
      id: 'goal-mutation-lock',
      prompt: 'Navigate two pages with parallel strategy enabled',
      agentStrategy: { mode: 'parallel', maxWorkers: 2 },
      queueItems: [
        {
          id: 'nav-one',
          title: 'Open first page',
          metadata: { action: 'navigate', risk: 'low' },
        },
        {
          id: 'nav-two',
          title: 'Open second page',
          metadata: { action: 'navigate', risk: 'low' },
        },
      ],
    })

    const run = loop.runGoal(goal.id)
    await firstStarted

    expect(maxActive).toBe(1)
    expect(loop.getProgress(goal.id)).toMatchObject({
      queueCounts: {
        running: 1,
        pending: 1,
      },
      lockStatus: {
        browserMutationLocked: true,
        lockedByItemId: 'nav-one',
      },
    })

    releaseFirst?.()
    const result = await run

    expect(result.status).toBe('completed')
    expect(maxActive).toBe(1)
    expect(observedLocks).toContainEqual({
      browserMutationLocked: true,
      lockedByItemId: 'nav-one',
    })
  })

  it('auto-runs low-risk form edits and dropdown selections under Full Browser Access', async () => {
    const executed: string[] = []
    const { loop } = createLoop({
      execute: async ({ item }) => {
        executed.push(item.id)
        return { status: 'completed', evidence: { id: item.id } }
      },
    })
    const goal = loop.createGoal({
      id: 'goal-form-controls',
      prompt: 'Fill and select public filters',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      queueItems: [
        {
          id: 'fill-search',
          title: 'Fill airport search field',
          metadata: {
            action: 'fill',
            risk: 'low',
            selector: 'input[name=q]',
            value: 'KJFK',
          },
        },
        {
          id: 'select-authority',
          title: 'Select authority dropdown',
          metadata: {
            action: 'select',
            risk: 'low',
            element: 12,
            value: 'Azerbaijan (UB)',
          },
        },
        {
          id: 'check-public',
          title: 'Check public charts',
          metadata: {
            action: 'check',
            risk: 'low',
            element: 13,
          },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(executed).toEqual([
      'fill-search',
      'select-authority',
      'check-public',
    ])
    expect(result.manifest?.totals.completed).toBe(3)
  })

  it('auto-runs credential-like field edits under Full Browser Access', async () => {
    let executorCalls = 0
    const { loop, local } = createLoop({
      execute: async () => {
        executorCalls += 1
        return { status: 'completed' }
      },
    })
    const goal = loop.createGoal({
      id: 'goal-password-fill',
      prompt: 'Fill sign-in fields',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      queueItems: [
        {
          id: 'password',
          title: 'Fill password field',
          metadata: {
            action: 'fill',
            risk: 'low',
            selector: 'input[type=password]',
            value: 'secret-password',
          },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(executorCalls).toBe(1)
    expect(result.approval).toBeUndefined()
    expect(local.getGoal(goal.id)?.queue[0]).toMatchObject({
      status: 'completed',
      metadata: {
        action: 'fill',
        risk: 'low',
      },
    })
  })

  it('pauses before high-risk queue items and records approval state', async () => {
    let executorCalls = 0
    const { loop, local } = createLoop({
      execute: async () => {
        executorCalls += 1
        return { status: 'completed' }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-approval',
      sessionId: 'session-approval',
      prompt: 'Log in and change billing settings',
      queueItems: [
        {
          id: 'login',
          title: 'Log in to account',
          metadata: { action: 'login', risk: 'high' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('paused_for_approval')
    expect(executorCalls).toBe(0)
    expect(result.approval).toMatchObject({
      required: true,
      action: 'login',
    })
    expect(local.getGoal(goal.id)).toMatchObject({
      status: 'paused',
      queue: [
        {
          id: 'login',
          status: 'blocked',
          metadata: {
            action: 'login',
            approvalRequired: true,
          },
        },
      ],
    })
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).toEqual(expect.arrayContaining(['approval.required']))
    expect(local.getAuditEvents('session-approval')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'goal.approval_required',
        }),
      ]),
    )
  })

  it('auto-runs high-risk queue items under Full Browser Access', async () => {
    const executed: string[] = []
    const { loop, local } = createLoop({
      execute: async ({ item }) => {
        executed.push(item.id)
        return { status: 'completed' }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-full-browser-login',
      prompt: 'Log in and continue',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
      queueItems: [
        {
          id: 'login',
          title: 'Log in to account',
          metadata: { action: 'login', risk: 'high' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(result.approval).toBeUndefined()
    expect(executed).toEqual(['login'])
    expect(local.getGoal(goal.id)).toMatchObject({
      status: 'completed',
      queue: [
        {
          id: 'login',
          status: 'completed',
          metadata: {
            action: 'login',
            risk: 'high',
          },
        },
      ],
    })
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).not.toContain('approval.required')
  })

  it('stores Full Browser Access contracts with every action auto-approved and no pause list', () => {
    const { loop } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-full-browser-scope',
      prompt: 'Log in, fill credentials, download files, and continue',
      approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
    })

    expect(goal.metadata).toMatchObject({
      goalLoopContract: {
        approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
        approvalScope: {
          autoApprove: expect.arrayContaining([
            'read',
            'navigate',
            'click',
            'fill',
            'download',
            'login',
            'credential',
            'purchase',
            'upload',
            'delete',
            'public_post',
            'message',
          ]),
          pauseFor: [],
        },
      },
    })
  })

  it('manual resume grants blocked approval items and requeues them', async () => {
    const executed: string[] = []
    const { loop, local } = createLoop({
      execute: async ({ item }) => {
        executed.push(item.id)
        return { status: 'completed' }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-approval-resume',
      sessionId: 'session-approval-resume',
      prompt: 'Log in after user approval',
      queueItems: [
        {
          id: 'login',
          title: 'Log in to account',
          metadata: { action: 'login', risk: 'high' },
        },
      ],
    })

    const paused = await loop.runGoal(goal.id)
    expect(paused.status).toBe('paused_for_approval')
    expect(executed).toEqual([])

    const resumed = loop.markResuming(goal.id, 'manual_resume', {
      grantBlockedApproval: true,
    })
    expect(resumed).toMatchObject({
      status: 'running',
      queue: [
        {
          id: 'login',
          status: 'pending',
          error: undefined,
          metadata: {
            action: 'login',
            approvalRequired: false,
            approvalGranted: true,
          },
        },
      ],
    })

    const completed = await loop.runGoal(goal.id)
    expect(completed.status).toBe('completed')
    expect(executed).toEqual(['login'])
    expect(
      local.getGoal(goal.id)?.checkpoints.map((entry) => entry.type),
    ).toEqual(expect.arrayContaining(['approval.required', 'approval.granted']))
  })

  it('manual resume requeues previously approved blocked items', () => {
    const { loop, local } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-approved-blocked-resume',
      prompt: 'Log in after approval',
      queueItems: [
        {
          id: 'login',
          title: 'Log in to account',
          status: 'blocked',
          error:
            'Approved login requires an existing signed-in browser session.',
          metadata: {
            action: 'login',
            risk: 'high',
            approvalRequired: false,
            approvalGranted: true,
            approvedAt: 123,
          },
        },
      ],
    })
    local.updateGoalStatus(goal.id, 'paused')

    const resumed = loop.markResuming(goal.id, 'manual_resume', {
      grantBlockedApproval: true,
    })

    expect(resumed).toMatchObject({
      status: 'running',
      queue: [
        {
          id: 'login',
          status: 'pending',
          error: undefined,
          metadata: {
            action: 'login',
            approvalGranted: true,
            approvedAt: 123,
          },
        },
      ],
    })
  })

  it('does not reopen completed goals on manual resume', async () => {
    const { loop, local } = createLoop()

    const goal = loop.createGoal({
      id: 'goal-completed-resume',
      prompt: 'Read one page',
      queueItems: [
        {
          id: 'read',
          title: 'Read page',
          metadata: { action: 'read', risk: 'low' },
        },
      ],
    })
    await loop.runGoal(goal.id)

    const resumed = loop.markResuming(goal.id, 'manual_resume', {
      grantBlockedApproval: true,
    })

    expect(resumed?.status).toBe('completed')
    expect(local.getGoal(goal.id)?.status).toBe('completed')
  })

  it('automatic resume does not grant high-risk approval', async () => {
    let executorCalls = 0
    const { loop, local } = createLoop({
      execute: async () => {
        executorCalls += 1
        return { status: 'completed' }
      },
    })

    const goal = loop.createGoal({
      id: 'goal-auto-resume-approval',
      prompt: 'Log in after approval',
      queueItems: [
        {
          id: 'login',
          title: 'Log in to account',
          metadata: { action: 'login', risk: 'high' },
        },
      ],
    })

    await loop.runGoal(goal.id)
    loop.markResuming(goal.id, 'restart_resume')
    const rerun = await loop.runGoal(goal.id)

    expect(rerun.status).toBe('paused_for_approval')
    expect(executorCalls).toBe(0)
    expect(local.getGoal(goal.id)).toMatchObject({
      status: 'paused',
      queue: [
        {
          id: 'login',
          status: 'blocked',
          metadata: {
            approvalRequired: true,
          },
        },
      ],
    })
  })

  it('marks an item failed after retry limit and includes it in the final manifest', async () => {
    const { loop } = createLoop({
      execute: async () => ({
        status: 'failed',
        retryable: true,
        error: 'source unavailable',
      }),
    })
    const goal = loop.createGoal({
      id: 'goal-failed',
      prompt: 'Download unavailable chart',
      queueItems: [
        {
          id: 'failed-item',
          title: 'Download unavailable chart',
          maxAttempts: 2,
          metadata: { action: 'download', risk: 'low' },
        },
      ],
    })

    const result = await loop.runGoal(goal.id)

    expect(result.status).toBe('completed')
    expect(result.manifest).toMatchObject({
      totals: {
        completed: 0,
        skipped: 0,
        failed: 1,
        blocked: 0,
        pending: 0,
      },
      failed: [
        {
          id: 'failed-item',
          attempts: 2,
          error: 'source unavailable',
        },
      ],
    })
  })

  it('resumes unfinished goals in bulk after restart', async () => {
    const { loop, local } = createLoop({
      execute: async ({ item }) => ({
        status: 'completed',
        evidence: { id: item.id },
      }),
    })
    const goal = loop.createGoal({
      id: 'goal-bulk-resume',
      prompt: 'Read queued sources',
      queueItems: [
        {
          id: 'bulk-item',
          title: 'Read source',
          metadata: { action: 'read', risk: 'low' },
        },
      ],
    })
    local.updateGoalStatus(goal.id, 'running')

    const restartedLoop = new GoalLoopService({
      service: local,
      executor: {
        execute: async ({ item }) => ({
          status: 'completed',
          evidence: { id: item.id },
        }),
      },
    })
    const results = await restartedLoop.resumeUnfinishedGoals()

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      status: 'completed',
      manifest: {
        totals: {
          completed: 1,
          pending: 0,
        },
      },
    })
  })
})

function createLoop(options?: {
  execute?: (
    context: GoalLoopExecutionContext,
  ) => Promise<GoalLoopExecutorResult>
}) {
  const handle = initializeDb({ dbPath: ':memory:' })
  const local = new LocalSessionService({ db: handle.db })
  const loop = new GoalLoopService({
    service: local,
    executor: {
      execute:
        options?.execute ??
        (async () => ({
          status: 'completed',
        })),
    },
  })
  return { local, loop }
}
