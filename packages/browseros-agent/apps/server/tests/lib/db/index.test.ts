/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, initializeDb } from '../../../src/lib/db'
import { agentDefinitions } from '../../../src/lib/db/schema'
import { rmTempDirs } from '../../__helpers__/rm-temp-dir'

describe('database initialization', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    closeDb()
    await rmTempDirs(tempDirs)
    tempDirs.length = 0
  })

  it('creates the parent directory, opens sqlite, and runs migrations', () => {
    const dir = mkTempDir()
    const dbPath = join(dir, 'nested', 'pannamos.sqlite')

    const handle = initializeDb({ dbPath })
    const rows = handle.db.select().from(agentDefinitions).all()

    expect(existsSync(dbPath)).toBe(true)
    expect(rows).toEqual([])
  })

  it('is idempotent when initialized twice for the same path', () => {
    const dir = mkTempDir()
    const dbPath = join(dir, 'pannamos.sqlite')

    const first = initializeDb({ dbPath })
    const second = initializeDb({ dbPath })

    expect(second).toBe(first)
  })

  it('fails clearly when an explicit migration directory is missing', () => {
    const dir = mkTempDir()

    expect(() =>
      initializeDb({
        dbPath: join(dir, 'pannamos.sqlite'),
        migrationsDir: join(dir, 'missing-migrations'),
      }),
    ).toThrow(/Drizzle migrations directory not found/)
  })

  function mkTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'browseros-db-test-'))
    tempDirs.push(dir)
    return dir
  }
})
