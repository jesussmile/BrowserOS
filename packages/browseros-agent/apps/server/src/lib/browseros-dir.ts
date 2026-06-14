import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { PATHS } from '@browseros/shared/constants/paths'
import type { ServerDiscoveryConfig } from '@browseros/shared/types/server-config'
import { logger } from './logger'

export function getDefaultStorageRoot(): string {
  if (process.platform === 'win32') {
    return PATHS.WINDOWS_STORAGE_ROOT
  }

  return join(homedir(), PATHS.BROWSEROS_DIR_NAME)
}

export function getStorageRoot(): string {
  const override = process.env.PANNAMOS_STORAGE_ROOT?.trim()
  return override ? resolve(override) : getDefaultStorageRoot()
}

export function getBrowserosDir(): string {
  const override = process.env.BROWSEROS_DIR?.trim()
  if (override) {
    return override
  }
  const storageRoot = process.env.PANNAMOS_STORAGE_ROOT?.trim()
  if (storageRoot) {
    return join(resolve(storageRoot), PATHS.SERVER_STATE_DIR_NAME)
  }
  if (process.env.NODE_ENV !== 'development') {
    return join(getDefaultStorageRoot(), PATHS.SERVER_STATE_DIR_NAME)
  }
  const dirName =
    process.env.NODE_ENV === 'development'
      ? PATHS.DEV_BROWSEROS_DIR_NAME
      : PATHS.BROWSEROS_DIR_NAME
  return join(homedir(), dirName)
}

export function logDevelopmentBrowserosDir(): void {
  if (process.env.NODE_ENV !== 'development') return
  logger.info(`Using development PannamOS directory: ${getBrowserosDir()}`)
}

export function getSessionsDir(): string {
  return join(getBrowserosDir(), PATHS.SESSIONS_DIR_NAME)
}

export function getCacheDir(): string {
  return join(getBrowserosDir(), PATHS.CACHE_DIR_NAME)
}

export function getOutputsDir(): string {
  const override = process.env.PANNAMOS_OUTPUTS_DIR?.trim()
  return override
    ? resolve(override)
    : join(getStorageRoot(), PATHS.OUTPUTS_DIR_NAME)
}

export function getManualOutputsDir(): string {
  return join(getOutputsDir(), PATHS.MANUAL_OUTPUT_DIR_NAME)
}

export function getToolCallOutputsDir(): string {
  return join(getOutputsDir(), PATHS.TOOL_CALL_OUTPUT_DIR_NAME)
}

export function getGoalLoopOutputsDir(): string {
  return join(getOutputsDir(), PATHS.GOAL_LOOP_OUTPUT_DIR_NAME)
}

export function getLogsDir(): string {
  return join(getStorageRoot(), PATHS.LOGS_DIR_NAME)
}

/** Returns the durable SQLite database path for local PannamOS server state. */
export function getDbPath(): string {
  const dbDir = join(getBrowserosDir(), PATHS.DB_DIR_NAME)
  const dbPath = join(dbDir, PATHS.DB_FILE_NAME)
  copyLegacyDbIfNeeded(dbDir, dbPath)
  return dbPath
}

function copyLegacyDbIfNeeded(dbDir: string, dbPath: string): void {
  const legacyDbPath = join(dbDir, PATHS.LEGACY_DB_FILE_NAME)
  if (existsSync(dbPath) || !existsSync(legacyDbPath)) return

  mkdirSync(dbDir, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const legacyPath = `${legacyDbPath}${suffix}`
    if (existsSync(legacyPath)) {
      copyFileSync(legacyPath, `${dbPath}${suffix}`)
    }
  }
}

export function getVmCacheDir(): string {
  return join(getCacheDir(), 'vm')
}

export function getLimaHomeDir(): string {
  return join(getBrowserosDir(), 'lima')
}

export function getVmStateDir(): string {
  return join(getBrowserosDir(), 'vm')
}

export function getVmDisksDir(): string {
  return getVmCacheDir()
}

export function getLazyMonitoringDir(): string {
  return join(getBrowserosDir(), 'lazy-monitoring')
}

export function getLazyMonitoringRunsDir(): string {
  return join(getLazyMonitoringDir(), 'runs')
}

export function getLazyMonitoringRunDir(runId: string): string {
  return join(getLazyMonitoringRunsDir(), runId)
}

export function getServerConfigPath(): string {
  return join(getBrowserosDir(), PATHS.SERVER_CONFIG_FILE_NAME)
}

/** Returns the user-managed SOUL.md path used as passive agent prompt context. */
export function getSoulPath(): string {
  return join(getBrowserosDir(), PATHS.SOUL_FILE_NAME)
}

export async function writeServerConfig(
  config: ServerDiscoveryConfig,
): Promise<void> {
  await writeFile(getServerConfigPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export function removeServerConfigSync(): void {
  try {
    unlinkSync(getServerConfigPath())
  } catch {
    // File may not exist or already be removed
  }
}

export async function ensureBrowserosDir(): Promise<void> {
  logDevelopmentBrowserosDir()
  await mkdir(getSessionsDir(), { recursive: true })
  await mkdir(getLazyMonitoringRunsDir(), { recursive: true })
  await mkdir(getVmDisksDir(), { recursive: true })
  await mkdir(getManualOutputsDir(), { recursive: true })
  await mkdir(getToolCallOutputsDir(), { recursive: true })
  await mkdir(getGoalLoopOutputsDir(), { recursive: true })
  await mkdir(getLogsDir(), { recursive: true })
}

export async function cleanOldSessions(): Promise<void> {
  const sessionsDir = getSessionsDir()
  let entries: string[]
  try {
    entries = await readdir(sessionsDir)
  } catch {
    return
  }

  const cutoff = Date.now() - PATHS.SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let removed = 0

  for (const entry of entries) {
    const entryPath = join(sessionsDir, entry)
    try {
      const info = await stat(entryPath)
      if (info.isDirectory() && info.mtimeMs < cutoff) {
        await rm(entryPath, { recursive: true })
        removed++
      }
    } catch {
      // skip entries that were already removed or inaccessible
    }
  }

  if (removed > 0) {
    logger.info(`Cleaned ${removed} stale session directories`)
  }
}
