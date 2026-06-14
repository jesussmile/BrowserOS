import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { getToolCallOutputsDir } from '../lib/browseros-dir'

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'tool-output'
}

export async function writeTempToolOutputFile(args: {
  toolName: string
  extension: string
  content: string
}): Promise<string> {
  const toolName = sanitizeSegment(args.toolName)
  const extension = sanitizeSegment(args.extension) || 'txt'
  const date = new Date().toISOString().slice(0, 10)
  const outputDir = join(getToolCallOutputsDir(), date, toolName)
  await mkdir(outputDir, { recursive: true })
  const filePath = join(
    outputDir,
    `${toolName}-${Date.now()}-${randomUUID()}.${extension}`,
  )

  await Bun.write(filePath, args.content)
  return filePath
}
