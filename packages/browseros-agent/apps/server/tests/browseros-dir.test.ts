/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { PATHS } from '@browseros/shared/constants/paths'
import {
  getBrowserosDir,
  getCacheDir,
  getDbPath,
  getDefaultStorageRoot,
  getGoalLoopOutputsDir,
  getManualOutputsDir,
  getOutputsDir,
  getStorageRoot,
  getToolCallOutputsDir,
  getVmCacheDir,
  logDevelopmentBrowserosDir,
} from '../src/lib/browseros-dir'
import { logger } from '../src/lib/logger'

describe('getBrowserosDir', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalBrowserosDir = process.env.BROWSEROS_DIR
  const originalStorageRoot = process.env.PANNAMOS_STORAGE_ROOT
  const originalOutputsDir = process.env.PANNAMOS_OUTPUTS_DIR

  beforeEach(() => {
    delete process.env.NODE_ENV
    delete process.env.BROWSEROS_DIR
    delete process.env.PANNAMOS_STORAGE_ROOT
    delete process.env.PANNAMOS_OUTPUTS_DIR
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }

    if (originalBrowserosDir === undefined) {
      delete process.env.BROWSEROS_DIR
    } else {
      process.env.BROWSEROS_DIR = originalBrowserosDir
    }

    if (originalStorageRoot === undefined) {
      delete process.env.PANNAMOS_STORAGE_ROOT
    } else {
      process.env.PANNAMOS_STORAGE_ROOT = originalStorageRoot
    }

    if (originalOutputsDir === undefined) {
      delete process.env.PANNAMOS_OUTPUTS_DIR
    } else {
      process.env.PANNAMOS_OUTPUTS_DIR = originalOutputsDir
    }
  })

  it('uses a separate home directory in development', () => {
    process.env.NODE_ENV = 'development'

    expect(getBrowserosDir()).toBe(join(homedir(), '.pannamos-dev'))
  })

  it('uses the standard home directory outside development', () => {
    process.env.NODE_ENV = 'test'

    expect(getBrowserosDir()).toBe(
      join(getDefaultStorageRoot(), PATHS.SERVER_STATE_DIR_NAME),
    )
  })

  it('logs the resolved development directory path', () => {
    process.env.NODE_ENV = 'development'
    const originalInfo = logger.info
    const info = mock(() => {})
    logger.info = info

    try {
      logDevelopmentBrowserosDir()

      expect(info).toHaveBeenCalledWith(
        `Using development PannamOS directory: ${join(homedir(), '.pannamos-dev')}`,
      )
    } finally {
      logger.info = originalInfo
    }
  })

  it('does not log a development directory outside development', () => {
    process.env.NODE_ENV = 'test'
    const originalInfo = logger.info
    const info = mock(() => {})
    logger.info = info

    try {
      logDevelopmentBrowserosDir()

      expect(info).not.toHaveBeenCalled()
    } finally {
      logger.info = originalInfo
    }
  })

  it('uses the development cache directory in development', () => {
    process.env.NODE_ENV = 'development'

    expect(getCacheDir()).toBe(join(homedir(), '.pannamos-dev', 'cache'))
  })

  it('uses the PannamOS directory for the sqlite database', () => {
    process.env.NODE_ENV = 'development'

    expect(getDbPath()).toBe(
      join(
        homedir(),
        PATHS.DEV_BROWSEROS_DIR_NAME,
        PATHS.DB_DIR_NAME,
        PATHS.DB_FILE_NAME,
      ),
    )
  })

  it('uses the standard PannamOS directory for the sqlite database outside development', () => {
    process.env.NODE_ENV = 'test'

    expect(getDbPath()).toBe(
      join(
        getDefaultStorageRoot(),
        PATHS.SERVER_STATE_DIR_NAME,
        PATHS.DB_DIR_NAME,
        PATHS.DB_FILE_NAME,
      ),
    )
  })

  it('copies the legacy sqlite database into the PannamOS database filename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pannamos-db-migration-'))

    try {
      process.env.BROWSEROS_DIR = dir
      const dbDir = join(dir, PATHS.DB_DIR_NAME)
      const legacyPath = join(dbDir, PATHS.LEGACY_DB_FILE_NAME)
      mkdirSync(dbDir, { recursive: true })
      writeFileSync(legacyPath, 'legacy-db')
      writeFileSync(`${legacyPath}-wal`, 'legacy-wal')

      const dbPath = getDbPath()

      expect(dbPath).toBe(join(dbDir, PATHS.DB_FILE_NAME))
      expect(existsSync(dbPath)).toBe(true)
      expect(readFileSync(dbPath, 'utf8')).toBe('legacy-db')
      expect(readFileSync(`${dbPath}-wal`, 'utf8')).toBe('legacy-wal')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses the standard cache directory outside development', () => {
    process.env.NODE_ENV = 'test'

    expect(getCacheDir()).toBe(
      join(getDefaultStorageRoot(), PATHS.SERVER_STATE_DIR_NAME, 'cache'),
    )
  })

  it('uses PANNAMOS_STORAGE_ROOT for server state and outputs', () => {
    const root = join(tmpdir(), 'pannamos-storage-root-test')
    process.env.PANNAMOS_STORAGE_ROOT = root

    expect(getStorageRoot()).toBe(root)
    expect(getBrowserosDir()).toBe(join(root, PATHS.SERVER_STATE_DIR_NAME))
    expect(getOutputsDir()).toBe(join(root, PATHS.OUTPUTS_DIR_NAME))
    expect(getManualOutputsDir()).toBe(
      join(root, PATHS.OUTPUTS_DIR_NAME, PATHS.MANUAL_OUTPUT_DIR_NAME),
    )
    expect(getToolCallOutputsDir()).toBe(
      join(root, PATHS.OUTPUTS_DIR_NAME, PATHS.TOOL_CALL_OUTPUT_DIR_NAME),
    )
    expect(getGoalLoopOutputsDir()).toBe(
      join(root, PATHS.OUTPUTS_DIR_NAME, PATHS.GOAL_LOOP_OUTPUT_DIR_NAME),
    )
  })

  it('allows PANNAMOS_OUTPUTS_DIR to override generated outputs only', () => {
    const root = join(tmpdir(), 'pannamos-storage-root-test')
    const outputs = join(tmpdir(), 'pannamos-outputs-test')
    process.env.PANNAMOS_STORAGE_ROOT = root
    process.env.PANNAMOS_OUTPUTS_DIR = outputs

    expect(getBrowserosDir()).toBe(join(root, PATHS.SERVER_STATE_DIR_NAME))
    expect(getOutputsDir()).toBe(outputs)
    expect(getManualOutputsDir()).toBe(
      join(outputs, PATHS.MANUAL_OUTPUT_DIR_NAME),
    )
  })

  it('uses a vm cache directory below cache', () => {
    process.env.NODE_ENV = 'development'

    expect(getVmCacheDir()).toBe(
      join(homedir(), '.pannamos-dev', 'cache', 'vm'),
    )
  })
})
