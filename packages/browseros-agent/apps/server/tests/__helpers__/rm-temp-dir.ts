/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { rm } from 'node:fs/promises'

export async function rmTempDirs(dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    await rmTempDir(dir)
  }
}

async function rmTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    } catch (error) {
      if (!isRetryableRmError(error)) throw error
      if (attempt === 5) return
      await Bun.sleep(50 * (attempt + 1))
    }
  }
}

function isRetryableRmError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EBUSY' || error.code === 'EPERM')
  )
}
