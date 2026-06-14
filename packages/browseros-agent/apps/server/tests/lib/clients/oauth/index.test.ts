/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getOAuthTokenManager,
  initializeOAuth,
  shutdownOAuth,
} from '../../../../src/lib/clients/oauth'
import { closeDb, initializeDb } from '../../../../src/lib/db'
import { rmTempDirs } from '../../../__helpers__/rm-temp-dir'

describe('OAuth client setup', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    shutdownOAuth()
    closeDb()
    await rmTempDirs(tempDirs)
    tempDirs.length = 0
  })

  it('initializes a process token manager backed by the PannamOS database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'browseros-oauth-index-test-'))
    tempDirs.push(dir)
    const handle = initializeDb({
      dbPath: join(dir, 'db', 'pannamos.sqlite'),
    })

    const manager = initializeOAuth(handle.db, 'browseros-1')

    expect(getOAuthTokenManager()).toBe(manager)
    expect(manager.getStatus('qwen-code')).toEqual({
      authenticated: false,
      email: undefined,
      provider: 'qwen-code',
    })

    manager.storeTokens('qwen-code', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
    })

    expect(manager.getStatus('qwen-code')).toEqual({
      authenticated: true,
      email: undefined,
      provider: 'qwen-code',
    })
  })

  it('stops and clears the current process token manager', () => {
    const handle = initializeTestDb()
    const firstManager = initializeOAuth(handle.db, 'browseros-1')
    const stopFirst = spyOn(firstManager, 'stopCallbackServer')

    const secondManager = initializeOAuth(handle.db, 'browseros-2')

    expect(stopFirst).toHaveBeenCalledTimes(1)
    expect(getOAuthTokenManager()).toBe(secondManager)

    const stopSecond = spyOn(secondManager, 'stopCallbackServer')

    shutdownOAuth()

    expect(stopSecond).toHaveBeenCalledTimes(1)
    expect(getOAuthTokenManager()).toBeNull()
  })

  function initializeTestDb() {
    const dir = mkdtempSync(join(tmpdir(), 'browseros-oauth-index-test-'))
    tempDirs.push(dir)
    return initializeDb({
      dbPath: join(dir, 'db', 'pannamos.sqlite'),
    })
  }
})
