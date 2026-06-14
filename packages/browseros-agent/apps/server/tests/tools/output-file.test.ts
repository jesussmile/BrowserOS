import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PATHS } from '@browseros/shared/constants/paths'
import { writeTempToolOutputFile } from '../../src/tools/output-file'

describe('writeTempToolOutputFile', () => {
  const originalStorageRoot = process.env.PANNAMOS_STORAGE_ROOT
  const originalOutputsDir = process.env.PANNAMOS_OUTPUTS_DIR
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
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

  it('writes scratch output below Outputs/ToolCalls/date/tool', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pannamos-output-root-'))
    tempDirs.push(root)
    process.env.PANNAMOS_STORAGE_ROOT = root
    delete process.env.PANNAMOS_OUTPUTS_DIR

    const filePath = await writeTempToolOutputFile({
      toolName: 'filesystem/read',
      extension: 'txt',
      content: 'large output',
    })

    const expectedPrefix = join(
      root,
      PATHS.OUTPUTS_DIR_NAME,
      PATHS.TOOL_CALL_OUTPUT_DIR_NAME,
      new Date().toISOString().slice(0, 10),
      'filesystem-read',
    )
    expect(filePath.startsWith(expectedPrefix)).toBe(true)
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf8')).toBe('large output')
  })
})
