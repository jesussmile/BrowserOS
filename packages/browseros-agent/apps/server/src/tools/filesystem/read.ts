import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import {
  executeWithMetrics,
  type FilesystemToolResult,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MAX_READ_CHARS,
  MAX_READ_LINES,
  toModelOutput,
} from './utils'

const TOOL_NAME = 'filesystem_read'

function createImageResult(
  path: string,
  ext: string,
  buffer: Buffer<ArrayBuffer>,
) {
  const mimeType = IMAGE_MIME_TYPES[ext] || 'application/octet-stream'
  return {
    text: `Image: ${path} (${buffer.byteLength} bytes)`,
    images: [{ data: buffer.toString('base64'), mimeType }],
  }
}

function getStartIndex(offset?: number): number {
  return offset ? Math.max(0, offset - 1) : 0
}

function getSelectedLines(
  allLines: string[],
  startIdx: number,
  limit?: number,
): string[] {
  if (limit !== undefined && limit <= 0) {
    throw new Error('filesystem_read limit must be greater than 0.')
  }

  const readLimit =
    limit === undefined ? MAX_READ_LINES : Math.min(limit, MAX_READ_LINES)
  const remaining = allLines.slice(startIdx)
  if (readLimit < remaining.length) {
    return remaining.slice(0, readLimit)
  }
  return remaining
}

function formatReadResult(args: {
  selected: string[]
  startIdx: number
  totalLines: number
  limit?: number
}): FilesystemToolResult {
  const startLineNum = args.startIdx + 1
  const endLineNum = args.startIdx + args.selected.length
  const width = String(endLineNum).length
  const notes: string[] = []

  if (args.limit !== undefined && args.limit > MAX_READ_LINES) {
    notes.push(
      `Requested limit ${args.limit} was capped at ${MAX_READ_LINES} lines.`,
    )
  }

  const buildFooter = (lastLineNum: number, charTruncated: boolean) => {
    const footerNotes = [...notes]
    if (charTruncated) {
      footerNotes.push(
        `Output was truncated to stay under the ${MAX_READ_CHARS}-character filesystem_read response limit.`,
      )
    }
    if (lastLineNum < args.totalLines) {
      footerNotes.push(
        `${args.totalLines - lastLineNum} more lines in file. Use offset=${lastLineNum + 1} to continue reading.`,
      )
    } else if (args.startIdx > 0) {
      footerNotes.push(
        `Showing lines ${startLineNum}-${lastLineNum} of ${args.totalLines}.`,
      )
    }
    return footerNotes.length ? `\n\n(${footerNotes.join(' ')})` : ''
  }

  const returned: string[] = []
  let charTruncated = false
  let bodyLength = 0

  for (let i = 0; i < args.selected.length; i++) {
    const lineNum = args.startIdx + i + 1
    const prefix = `${String(lineNum).padStart(width)} | `
    const rawLine = args.selected[i]
    const separatorLength = returned.length > 0 ? 1 : 0
    const fullLine = `${prefix}${rawLine}`
    const fullFooter = buildFooter(lineNum, false)

    if (
      bodyLength + separatorLength + fullLine.length + fullFooter.length <=
      MAX_READ_CHARS
    ) {
      returned.push(fullLine)
      bodyLength += separatorLength + fullLine.length
      continue
    }

    const truncatedFooter = buildFooter(lineNum, true)
    const suffix = ' [truncated]'
    const available =
      MAX_READ_CHARS -
      bodyLength -
      separatorLength -
      truncatedFooter.length -
      prefix.length -
      suffix.length

    if (available > 0) {
      returned.push(`${prefix}${rawLine.slice(0, available)}${suffix}`)
      bodyLength += separatorLength + prefix.length + available + suffix.length
    }
    charTruncated = true
    break
  }

  const lastReturnedLineNum = args.startIdx + Math.max(returned.length, 1)
  let text = returned.join('\n')

  if (!text) {
    const lineNum = startLineNum
    text = `${String(lineNum).padStart(width)} | `
  }

  text += buildFooter(lastReturnedLineNum, charTruncated)

  return { text }
}

export function createReadTool(cwd: string) {
  return tool({
    description: `Read a file from the filesystem. Returns text content with line numbers, or image data for image files. Text reads are limited to ${MAX_READ_LINES} lines and ${MAX_READ_CHARS} characters per call. Use offset and limit to paginate through large files.`,
    inputSchema: z.object({
      path: z
        .string()
        .describe('File path (relative to working directory or absolute)'),
      offset: z
        .number()
        .optional()
        .describe('Starting line number (1-indexed)'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of lines to read'),
    }),
    execute: (params) =>
      executeWithMetrics(TOOL_NAME, async () => {
        const resolved = resolve(cwd, params.path)
        const ext = extname(resolved).toLowerCase()

        if (IMAGE_EXTENSIONS.has(ext)) {
          const buffer = await readFile(resolved)
          return createImageResult(params.path, ext, buffer)
        }

        const content = await readFile(resolved, 'utf-8')
        const allLines = content.split('\n')
        const totalLines = allLines.length

        const startIdx = getStartIndex(params.offset)
        if (startIdx >= totalLines) {
          return {
            text: `File has ${totalLines} lines. Offset ${params.offset} is beyond end of file.`,
          }
        }

        const selected = getSelectedLines(allLines, startIdx, params.limit)
        return formatReadResult({
          selected,
          startIdx,
          totalLines,
          limit: params.limit,
        })
      }),
    toModelOutput,
  })
}
