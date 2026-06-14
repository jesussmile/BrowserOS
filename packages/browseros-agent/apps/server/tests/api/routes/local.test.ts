/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import type { UIMessage } from 'ai'
import { createLocalRoutes } from '../../../src/api/routes/local'
import { LocalSessionService } from '../../../src/api/services/local-session-service'
import { closeDb, initializeDb } from '../../../src/lib/db'

describe('createLocalRoutes', () => {
  afterEach(() => {
    closeDb()
  })

  it('serves the built-in app catalog without cloud auth URLs', async () => {
    const route = createRoute()

    const catalogResponse = await route.request('/apps/catalog')
    expect(catalogResponse.status).toBe(200)
    const catalog = await catalogResponse.json()
    expect(catalog.count).toBeGreaterThan(0)
    expect(catalog.servers[0]).toMatchObject({
      connectionMode: 'local_catalog',
    })

    const addResponse = await route.request('/apps/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: 'Gmail',
        localConnectorUrl: 'http://localhost:8000/sse',
        localConnectorDescription: 'Local Gmail MCP',
      }),
    })
    expect(addResponse.status).toBe(200)
    expect(await addResponse.json()).toEqual({
      success: true,
      serverName: 'Gmail',
      strataId: 'local-catalog',
      addedServers: ['Gmail'],
      connectionMode: 'local_catalog',
      localConnector: {
        url: 'http://localhost:8000/sse',
        description: 'Local Gmail MCP',
      },
    })

    const integrationsResponse = await route.request('/apps/integrations')
    expect(integrationsResponse.status).toBe(200)
    const integrations = await integrationsResponse.json()
    expect(integrations.integrations).toContainEqual({
      name: 'Gmail',
      is_authenticated: false,
      connection_mode: 'local_catalog',
    })
  })

  it('checks local MCP connectors and rejects remote connector URLs', async () => {
    const route = createRoute({
      inspectMcpConnector: async (url) => {
        expect(url).toBe('http://localhost:8000/sse')
        return [
          {
            name: 'gmail_search',
            description: 'Search local Gmail connector',
          },
        ]
      },
    })

    const checkResponse = await route.request('/apps/check-connector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://localhost:8000/sse' }),
    })
    expect(checkResponse.status).toBe(200)
    expect(await checkResponse.json()).toEqual({
      ok: true,
      url: 'http://localhost:8000/sse',
      toolCount: 1,
      tools: [
        {
          name: 'gmail_search',
          description: 'Search local Gmail connector',
        },
      ],
    })

    const remoteCheckResponse = await route.request('/apps/check-connector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://mcp.example.com/sse' }),
    })
    expect(remoteCheckResponse.status).toBe(400)

    const remoteAddResponse = await route.request('/apps/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: 'Gmail',
        localConnectorUrl: 'https://mcp.example.com/sse',
      }),
    })
    expect(remoteAddResponse.status).toBe(400)
  })

  it('serves local-first agent adapters and runtime skills', async () => {
    const route = createRoute()

    const capabilitiesResponse = await route.request('/agent-capabilities')
    expect(capabilitiesResponse.status).toBe(200)
    const capabilities = await capabilitiesResponse.json()

    expect(capabilities.localFirst).toBe(true)
    expect(capabilities.cloud).toEqual({
      browserosLoginRequired: false,
      browserosCloudSync: false,
      managedAppAuth: false,
    })
    expect(
      capabilities.adapters.map((adapter: { id: string }) => adapter.id),
    ).toEqual(['claude', 'codex', 'hermes'])
    const skillIds = capabilities.skills.map(
      (skill: { id: string }) => skill.id,
    )
    expect(skillIds).toEqual(
      expect.arrayContaining([
        'approval-gates',
        'pannamos',
        'chat',
        'connected-apps',
        'extraction',
        'forms',
        'research',
        'workflow',
        'goal',
        'memory',
        'soul',
        'tab-workflows',
      ]),
    )
    expect(skillIds).toEqual(
      expect.arrayContaining([
        'ask-internal',
        'sup-systematic-debugging',
        'sup-test-driven-development',
        'write-docs',
      ]),
    )
    expect(capabilities.skills).toContainEqual({
      id: 'pannamos',
      name: 'pannamos',
      description: 'Use PannamOS MCP tools for browser automation.',
      source: 'local_runtime',
    })
    expect(capabilities.skills).toContainEqual(
      expect.objectContaining({
        id: 'ask-internal',
        name: 'ask-internal',
        source: 'repo_skill',
      }),
    )
    expect(
      capabilities.skills.every(
        (skill: Record<string, unknown>) => skill.skillDir === undefined,
      ),
    ).toBe(true)
    expect(capabilities.roles.map((role: { id: string }) => role.id)).toContain(
      'chief-of-staff',
    )
    expect(capabilities.roles.map((role: { id: string }) => role.id)).toEqual([
      'chief-of-staff',
      'research-analyst',
      'workflow-operator',
      'qa-browser-tester',
      'data-extraction-analyst',
      'knowledge-manager',
    ])

    const skillsResponse = await route.request('/agent-skills')
    expect(skillsResponse.status).toBe(200)
    const skills = await skillsResponse.json()
    expect(skills.count).toBe(capabilities.skills.length)
    expect(skills.skills.map((skill: { id: string }) => skill.id)).toEqual(
      skillIds,
    )

    const rolesResponse = await route.request('/agent-roles')
    expect(rolesResponse.status).toBe(200)
    const roles = await rolesResponse.json()
    expect(roles.count).toBeGreaterThan(0)
    expect(roles.roles).toContainEqual(
      expect.objectContaining({
        id: 'chief-of-staff',
        name: 'Chief of Staff',
      }),
    )
  })

  it('creates, lists, restores, and deletes local sessions', async () => {
    const route = createRoute()
    const message = createTextMessage('msg-1', 'user', 'Research this page')

    const createResponse = await route.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'session-1',
        messages: [message],
        lastMessagedAt: 123,
      }),
    })

    expect(createResponse.status).toBe(201)
    expect(await createResponse.json()).toMatchObject({
      session: {
        id: 'session-1',
        messages: [message],
        lastMessagedAt: 123,
      },
    })

    const listResponse = await route.request('/sessions')
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toMatchObject({
      sessions: [
        {
          id: 'session-1',
          messages: [message],
        },
      ],
    })

    const restoreResponse = await route.request('/sessions/session-1')
    expect(restoreResponse.status).toBe(200)
    expect(await restoreResponse.json()).toMatchObject({
      session: {
        id: 'session-1',
        messages: [message],
      },
    })

    const compactResponse = await route.request('/sessions/session-1/compact', {
      method: 'POST',
    })
    expect(compactResponse.status).toBe(200)
    expect(await compactResponse.json()).toMatchObject({
      compaction: {
        messageCount: 1,
        retainedRecentCount: 1,
        recentMessages: [{ role: 'user', text: 'Research this page' }],
      },
      session: {
        id: 'session-1',
      },
    })

    const deleteResponse = await route.request('/sessions/session-1', {
      method: 'DELETE',
    })
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual({ success: true })

    const missingResponse = await route.request('/sessions/session-1')
    expect(missingResponse.status).toBe(404)
  })

  it('persists goal runs and audit events locally', async () => {
    const route = createRoute()

    const sessionResponse = await route.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'session-goal', messages: [] }),
    })
    expect(sessionResponse.status).toBe(201)

    const goalResponse = await route.request('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-goal',
        prompt: 'Fill out the form but ask before submit',
      }),
    })

    expect(goalResponse.status).toBe(201)
    const goalBody = await goalResponse.json()
    expect(goalBody.goal).toMatchObject({
      sessionId: 'session-goal',
      prompt: 'Fill out the form but ask before submit',
      status: 'paused',
    })

    const resumeResponse = await route.request(
      `/goals/${goalBody.goal.id}/resume`,
      { method: 'POST' },
    )
    expect(resumeResponse.status).toBe(200)
    expect(await resumeResponse.json()).toMatchObject({
      goal: { status: 'running' },
    })

    const auditResponse = await route.request('/sessions/session-goal/audit')
    expect(auditResponse.status).toBe(200)
    expect(await auditResponse.json()).toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: 'goal.created' }),
        expect.objectContaining({ type: 'goal.running' }),
        expect.objectContaining({ type: 'goal.loop.resuming' }),
      ]),
    })
  })

  it('persists Goal Loop queue items, evidence, and checkpoints locally', async () => {
    const route = createRoute()

    const goalResponse = await route.request('/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'airport-pdf-goal',
        prompt: 'Download PDF charts for all approved airports',
        status: 'running',
        queueItems: [
          {
            id: 'download-kjfk',
            title: 'Download KJFK PDF chart',
            sourceUrl: 'https://example.test/kjfk.pdf',
          },
          {
            id: 'download-klax',
            title: 'Download KLAX PDF chart',
            sourceUrl: 'https://example.test/klax.pdf',
          },
        ],
      }),
    })

    expect(goalResponse.status).toBe(201)
    expect(await goalResponse.json()).toMatchObject({
      goal: {
        id: 'airport-pdf-goal',
        status: 'running',
        queue: [
          {
            id: 'download-kjfk',
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
          },
          {
            id: 'download-klax',
            status: 'pending',
          },
        ],
      },
    })

    const queueResponse = await route.request('/goals/airport-pdf-goal/queue')
    expect(queueResponse.status).toBe(200)
    expect(await queueResponse.json()).toMatchObject({
      queue: [
        { id: 'download-kjfk', orderIndex: 0 },
        { id: 'download-klax', orderIndex: 1 },
      ],
    })

    const completedResponse = await route.request(
      '/goals/airport-pdf-goal/queue/download-kjfk',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          attempts: 1,
          artifactPath: 'downloads/kjfk.pdf',
          evidence: {
            sha256: 'abc123',
            bytes: 12345,
          },
        }),
      },
    )
    expect(completedResponse.status).toBe(200)
    expect(await completedResponse.json()).toMatchObject({
      item: {
        id: 'download-kjfk',
        status: 'completed',
        attempts: 1,
        artifactPath: 'downloads/kjfk.pdf',
        evidence: {
          sha256: 'abc123',
          bytes: 12345,
        },
      },
    })

    const checkpointResponse = await route.request(
      '/goals/airport-pdf-goal/checkpoints',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'manifest.partial',
          summary: 'One airport chart downloaded, one pending',
          state: {
            completed: ['download-kjfk'],
            pending: ['download-klax'],
          },
        }),
      },
    )
    expect(checkpointResponse.status).toBe(201)

    const restoredResponse = await route.request('/goals/airport-pdf-goal')
    expect(restoredResponse.status).toBe(200)
    expect(await restoredResponse.json()).toMatchObject({
      goal: {
        id: 'airport-pdf-goal',
        queue: [
          { id: 'download-kjfk', status: 'completed' },
          { id: 'download-klax', status: 'pending' },
        ],
        checkpoints: [
          {
            type: 'manifest.partial',
            state: {
              completed: ['download-kjfk'],
              pending: ['download-klax'],
            },
          },
        ],
      },
    })
  })

  it('plans, runs, and exposes a Goal Loop manifest through local routes', async () => {
    const route = createRoute({
      goalLoopExecutor: {
        execute: async ({ item }) => ({
          status: 'completed',
          artifactPath: `outputs/${item.id}.pdf`,
          evidence: { route: true },
        }),
      },
    })

    const planResponse = await route.request('/goals/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'route-goal-loop',
        prompt: 'Download two approved PDFs',
        queueItems: [
          {
            id: 'pdf-one',
            title: 'Download PDF one',
            metadata: { action: 'download', risk: 'low' },
          },
          {
            id: 'pdf-two',
            title: 'Download PDF two',
            metadata: { action: 'download', risk: 'low' },
          },
        ],
      }),
    })
    expect(planResponse.status).toBe(201)
    expect(await planResponse.json()).toMatchObject({
      goal: {
        id: 'route-goal-loop',
        status: 'paused',
        queue: [
          { id: 'pdf-one', status: 'pending' },
          { id: 'pdf-two', status: 'pending' },
        ],
      },
    })

    const runResponse = await route.request('/goals/route-goal-loop/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(runResponse.status).toBe(200)
    expect(await runResponse.json()).toMatchObject({
      run: {
        status: 'completed',
        manifest: {
          totals: {
            completed: 2,
            pending: 0,
          },
        },
      },
    })

    const progressResponse = await route.request(
      '/goals/route-goal-loop/progress',
    )
    expect(progressResponse.status).toBe(200)
    expect(await progressResponse.json()).toMatchObject({
      progress: {
        goalRunId: 'route-goal-loop',
        status: 'completed',
        lifecycleStatus: 'complete',
        queueCounts: {
          completed: 2,
          pending: 0,
        },
        manifest: {
          totals: {
            completed: 2,
            pending: 0,
          },
        },
      },
    })

    const manifestResponse = await route.request(
      '/goals/route-goal-loop/manifest',
    )
    expect(manifestResponse.status).toBe(200)
    expect(await manifestResponse.json()).toMatchObject({
      manifest: {
        goalRunId: 'route-goal-loop',
        completed: [
          { id: 'pdf-one', artifactPath: 'outputs/pdf-one.pdf' },
          { id: 'pdf-two', artifactPath: 'outputs/pdf-two.pdf' },
        ],
      },
    })
  })

  it('starts Goal Loop work in a server-owned background run', async () => {
    let releaseExecutor: (() => void) | undefined
    let markExecutorStarted: (() => void) | undefined
    const executorStarted = new Promise<void>((resolve) => {
      markExecutorStarted = resolve
    })
    const executorRelease = new Promise<void>((resolve) => {
      releaseExecutor = resolve
    })
    const route = createRoute({
      goalLoopExecutor: {
        execute: async ({ item }) => {
          markExecutorStarted?.()
          await executorRelease
          return {
            status: 'completed',
            evidence: { id: item.id, background: true },
          }
        },
      },
    })

    const planResponse = await route.request('/goals/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'background-goal-loop',
        prompt: 'Read in the background',
        queueItems: [
          {
            id: 'background-item',
            title: 'Read background item',
            metadata: { action: 'read', risk: 'low' },
          },
        ],
      }),
    })
    expect(planResponse.status).toBe(201)

    const startResponse = await route.request(
      '/goals/background-goal-loop/run',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          background: true,
          resumeReason: 'ui_auto_continue',
        }),
      },
    )
    expect(startResponse.status).toBe(200)
    expect(await startResponse.json()).toMatchObject({
      run: {
        status: 'running',
        processedItems: 0,
        background: {
          started: true,
        },
      },
      progress: {
        status: 'running',
      },
    })

    await executorStarted
    const runningProgress = await route.request(
      '/goals/background-goal-loop/progress',
    )
    expect(runningProgress.status).toBe(200)
    expect(await runningProgress.json()).toMatchObject({
      progress: {
        status: 'running',
        queueCounts: {
          running: 1,
        },
        workerStatus: {
          activeWorkers: 1,
        },
      },
    })

    releaseExecutor?.()
    const completed = await waitForGoalProgress(route, 'background-goal-loop')
    expect(completed).toMatchObject({
      status: 'completed',
      queueCounts: {
        completed: 1,
        pending: 0,
      },
      manifest: {
        totals: {
          completed: 1,
        },
      },
    })
  })

  it('pauses, resumes, and cancels Goal Loop runs through local routes', async () => {
    const route = createRoute({
      goalLoopExecutor: {
        execute: async ({ item }) => ({
          status: 'completed',
          evidence: { id: item.id },
        }),
      },
    })

    const planResponse = await route.request('/goals/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'controlled-goal-loop',
        prompt: 'Read two pages',
        queueItems: [
          {
            id: 'first',
            title: 'Read first page',
            metadata: { action: 'read', risk: 'low' },
          },
          {
            id: 'second',
            title: 'Read second page',
            metadata: { action: 'read', risk: 'low' },
          },
        ],
      }),
    })
    expect(planResponse.status).toBe(201)

    const boundedRun = await route.request('/goals/controlled-goal-loop/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxItems: 1 }),
    })
    expect(boundedRun.status).toBe(200)
    expect(await boundedRun.json()).toMatchObject({
      run: {
        status: 'running',
        processedItems: 1,
        continuationPacket: {
          reason: 'pre_turn_limit',
          queueCounts: {
            completed: 1,
            pending: 1,
          },
        },
      },
    })

    const compactedProgress = await route.request(
      '/goals/controlled-goal-loop/progress',
    )
    expect(compactedProgress.status).toBe(200)
    expect(await compactedProgress.json()).toMatchObject({
      progress: {
        lifecycleStatus: 'compacting',
        continuation: {
          count: 1,
          packet: {
            reason: 'pre_turn_limit',
          },
        },
      },
    })

    const manualCompactResponse = await route.request(
      '/goals/controlled-goal-loop/compact',
      { method: 'POST' },
    )
    expect(manualCompactResponse.status).toBe(200)
    expect(await manualCompactResponse.json()).toMatchObject({
      packet: {
        reason: 'manual_resume',
        queueCounts: {
          completed: 1,
          pending: 1,
        },
      },
      progress: {
        continuation: {
          count: 2,
        },
      },
    })

    const pauseResponse = await route.request(
      '/goals/controlled-goal-loop/pause',
      { method: 'POST' },
    )
    expect(pauseResponse.status).toBe(200)
    expect(await pauseResponse.json()).toMatchObject({
      goal: { status: 'paused' },
    })

    const resumeResponse = await route.request(
      '/goals/controlled-goal-loop/resume',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    expect(resumeResponse.status).toBe(200)
    expect(await resumeResponse.json()).toMatchObject({
      goal: { status: 'running' },
    })

    const cancelResponse = await route.request(
      '/goals/controlled-goal-loop/cancel',
      { method: 'POST' },
    )
    expect(cancelResponse.status).toBe(200)
    expect(await cancelResponse.json()).toMatchObject({
      goal: { status: 'cancelled' },
    })
  })

  it('manual Goal Loop resume grants blocked approval items through local routes', async () => {
    const route = createRoute({
      goalLoopExecutor: {
        execute: async ({ item }) => ({
          status: 'completed',
          evidence: { id: item.id },
        }),
      },
    })

    const planResponse = await route.request('/goals/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'approval-route-goal',
        prompt: 'Log in with approval',
        queueItems: [
          {
            id: 'login',
            title: 'Log in to account',
            metadata: { action: 'login', risk: 'high' },
          },
        ],
      }),
    })
    expect(planResponse.status).toBe(201)

    const blockedRun = await route.request('/goals/approval-route-goal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxItems: 1 }),
    })
    expect(blockedRun.status).toBe(200)
    expect(await blockedRun.json()).toMatchObject({
      run: {
        status: 'paused_for_approval',
      },
    })

    const resumeResponse = await route.request(
      '/goals/approval-route-goal/resume',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantBlockedApproval: true }),
      },
    )
    expect(resumeResponse.status).toBe(200)
    expect(await resumeResponse.json()).toMatchObject({
      goal: {
        status: 'running',
        queue: [
          {
            id: 'login',
            status: 'pending',
            metadata: {
              approvalRequired: false,
              approvalGranted: true,
            },
          },
        ],
      },
    })

    const completedRun = await route.request('/goals/approval-route-goal/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxItems: 1 }),
    })
    expect(completedRun.status).toBe(200)
    expect(await completedRun.json()).toMatchObject({
      run: {
        status: 'completed',
      },
    })
  })

  it('records audit events before messages are saved for a new session', async () => {
    const route = createRoute()

    const auditResponse = await route.request('/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-audit-first',
        type: 'tool.browser.approval_required',
        summary: 'Browser tool press_key requires approval',
      }),
    })

    expect(auditResponse.status).toBe(201)

    const message = createTextMessage('msg-audit-first', 'user', 'Press Enter')
    const sessionResponse = await route.request('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'session-audit-first',
        messages: [message],
      }),
    })
    expect(sessionResponse.status).toBe(201)
    expect(await sessionResponse.json()).toMatchObject({
      session: {
        id: 'session-audit-first',
        messages: [message],
      },
    })

    const auditListResponse = await route.request(
      '/sessions/session-audit-first/audit',
    )
    expect(auditListResponse.status).toBe(200)
    expect(await auditListResponse.json()).toMatchObject({
      events: [{ type: 'tool.browser.approval_required' }],
    })
  })

  function createRoute(options?: Parameters<typeof createLocalRoutes>[0]) {
    const handle = initializeDb({
      dbPath: ':memory:',
    })
    return createLocalRoutes({
      ...options,
      service: new LocalSessionService({ db: handle.db }),
    })
  }
})

async function waitForGoalProgress(
  route: ReturnType<typeof createLocalRoutes>,
  goalId: string,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await route.request(`/goals/${goalId}/progress`)
    const body = await response.json()
    if (body.progress?.status === 'completed') return body.progress
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Goal did not complete: ${goalId}`)
}

function createTextMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string,
): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  }
}
