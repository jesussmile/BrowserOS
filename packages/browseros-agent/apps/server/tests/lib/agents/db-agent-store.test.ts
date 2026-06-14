/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { eq } from 'drizzle-orm'
import { DbAgentStore } from '../../../src/lib/agents/db-agent-store'
import {
  type DbHandle,
  openBrowserOsDatabase,
} from '../../../src/lib/db/client'
import { agentDefinitions } from '../../../src/lib/db/schema'

describe('DbAgentStore', () => {
  const handles: DbHandle[] = []

  afterEach(async () => {
    for (const handle of handles.splice(0)) {
      handle.sqlite.close()
    }
  })

  it('creates, lists, loads, updates, and deletes named agents', async () => {
    const store = createStore()

    const agent = await store.create({
      name: ' Review bot ',
      adapter: 'codex',
      modelId: 'gpt-5.5',
      reasoningEffort: 'medium',
    })

    expect(agent).toMatchObject({
      name: 'Review bot',
      adapter: 'codex',
      modelId: 'gpt-5.5',
      reasoningEffort: 'medium',
      permissionMode: 'approve-all',
      sessionKey: `agent:${agent.id}:main`,
      pinned: false,
    })

    const updated = await store.update(agent.id, {
      name: 'Renamed bot',
      pinned: true,
    })

    expect(updated).toMatchObject({
      id: agent.id,
      name: 'Renamed bot',
      pinned: true,
    })
    expect(await store.get(agent.id)).toEqual(updated)
    expect(await store.list()).toEqual([updated])
    expect(await store.delete(agent.id)).toBe(true)
    expect(await store.delete(agent.id)).toBe(false)
    expect(await store.list()).toEqual([])
  })

  it('serializes concurrent creates without dropping agents', async () => {
    const store = createStore()

    const created = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.create({
          name: `Agent ${index}`,
          adapter: index % 2 === 0 ? 'codex' : 'claude',
        }),
      ),
    )

    const listed = await store.list()
    expect(listed).toHaveLength(created.length)
    expect(new Set(listed.map((agent) => agent.id)).size).toBe(created.length)
  })

  it('persists adapter config with the agent record', async () => {
    const { db, store } = createStoreWithDb()

    const agent = await store.create({
      name: 'Hermes bot',
      adapter: 'hermes',
      providerType: 'openai-compatible',
      providerName: 'Kimi',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      apiKey: 'test-key',
      supportsImages: true,
    })

    const row = db
      .select()
      .from(agentDefinitions)
      .where(eq(agentDefinitions.id, agent.id))
      .get()

    expect(JSON.parse(row?.adapterConfigJson ?? '{}')).toEqual({
      providerType: 'openai-compatible',
      providerName: 'Kimi',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      apiKey: 'test-key',
      supportsImages: true,
    })
  })

  it('persists local role summaries for agent listings after reload', async () => {
    const { db, store } = createStoreWithDb()

    const agent = await store.create({
      name: 'Chief of Staff',
      adapter: 'codex',
      roleId: 'chief-of-staff',
    })

    expect(agent.role).toEqual({
      roleSource: 'builtin',
      roleId: 'chief-of-staff',
      roleName: 'Chief of Staff',
      shortDescription:
        'Executive coordination, follow-ups, scheduling, and briefing support.',
    })

    const reloaded = new DbAgentStore({ db })
    expect(await reloaded.get(agent.id)).toEqual(agent)
    expect(await reloaded.list()).toEqual([agent])
  })

  it('upserts existing records idempotently', async () => {
    const store = createStore()

    const first = await store.upsertExisting({
      id: 'agent-existing',
      name: 'Imported agent',
      adapter: 'codex',
      modelId: 'openrouter/anthropic/claude-sonnet-4.5',
    })
    const second = await store.upsertExisting({
      id: 'agent-existing',
      name: 'Changed imported name',
      adapter: 'codex',
    })

    expect(second).toEqual(first)
    expect(await store.list()).toEqual([first])
  })

  it('ignores stale rows with unsupported adapter ids', async () => {
    const { db, store } = createStoreWithDb()
    db.insert(agentDefinitions)
      .values({
        id: 'stale-agent',
        name: 'Stale agent',
        adapter: 'removed-adapter' as never,
        modelId: 'default',
        reasoningEffort: 'medium',
        permissionMode: 'approve-all',
        sessionKey: 'agent:stale-agent:main',
        pinned: false,
        adapterConfigJson: null,
        createdAt: 1000,
        updatedAt: 1000,
      })
      .run()

    expect(await store.get('stale-agent')).toBeNull()
    expect(await store.list()).toEqual([])
  })

  function createStore(): DbAgentStore {
    return createStoreWithDb().store
  }

  function createStoreWithDb() {
    const handle = openBrowserOsDatabase({
      dbPath: ':memory:',
    })
    handles.push(handle)
    return { db: handle.db, store: new DbAgentStore({ db: handle.db }) }
  }
})
