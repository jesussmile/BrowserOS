/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { OAuthTokenStore } from '../../../../src/lib/clients/oauth/token-store'
import { closeDb, initializeDb } from '../../../../src/lib/db'
import { rmTempDirs } from '../../../__helpers__/rm-temp-dir'

describe('OAuthTokenStore', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    closeDb()
    await rmTempDirs(tempDirs)
    tempDirs.length = 0
  })

  it('stores, updates, reads, reports status, and deletes provider tokens', () => {
    const store = createStore()

    store.upsertTokens('browseros-1', 'github-copilot', {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 1234,
      email: 'user@example.com',
      accountId: 'account-1',
    })

    expect(store.getTokens('browseros-1', 'github-copilot')).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 1234,
      email: 'user@example.com',
      accountId: 'account-1',
    })
    expect(store.getStatus('browseros-1', 'github-copilot')).toEqual({
      authenticated: true,
      email: 'user@example.com',
      provider: 'github-copilot',
    })

    store.upsertTokens('browseros-1', 'github-copilot', {
      accessToken: 'access-2',
      refreshToken: '',
      expiresAt: 0,
    })

    expect(store.getTokens('browseros-1', 'github-copilot')).toEqual({
      accessToken: 'access-2',
      refreshToken: '',
      expiresAt: 0,
      email: undefined,
      accountId: undefined,
    })

    store.deleteTokens('browseros-1', 'github-copilot')

    expect(store.getTokens('browseros-1', 'github-copilot')).toBeNull()
    expect(store.getStatus('browseros-1', 'github-copilot')).toEqual({
      authenticated: false,
      email: undefined,
      provider: 'github-copilot',
    })
  })

  it('adopts the latest local provider token when the install id changes', async () => {
    const store = createStore()

    store.upsertTokens('old-browseros-id', 'chatgpt-pro', {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 1234,
      email: 'old@example.com',
      accountId: 'old-account',
    })
    await Bun.sleep(2)
    store.upsertTokens('newer-browseros-id', 'chatgpt-pro', {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: 5678,
      email: 'new@example.com',
      accountId: 'new-account',
    })

    expect(store.getStatus('current-install-id', 'chatgpt-pro')).toEqual({
      authenticated: true,
      email: 'new@example.com',
      provider: 'chatgpt-pro',
    })
    expect(store.getTokens('current-install-id', 'chatgpt-pro')).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: 5678,
      email: 'new@example.com',
      accountId: 'new-account',
    })
  })

  it('disconnects all local tokens for a provider so adopted rows do not reappear', () => {
    const store = createStore()

    store.upsertTokens('old-browseros-id', 'chatgpt-pro', {
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 1234,
    })
    store.upsertTokens('current-install-id', 'chatgpt-pro', {
      accessToken: 'current-access',
      refreshToken: 'current-refresh',
      expiresAt: 5678,
    })

    store.deleteTokens('current-install-id', 'chatgpt-pro')

    expect(store.getTokens('current-install-id', 'chatgpt-pro')).toBeNull()
    expect(store.getStatus('current-install-id', 'chatgpt-pro')).toEqual({
      authenticated: false,
      email: undefined,
      provider: 'chatgpt-pro',
    })
  })

  function createStore(): OAuthTokenStore {
    const dir = mkdtempSync(join(tmpdir(), 'browseros-oauth-store-test-'))
    tempDirs.push(dir)
    const handle = initializeDb({
      dbPath: join(dir, 'db', 'pannamos.sqlite'),
    })
    return new OAuthTokenStore(handle.db)
  }
})
