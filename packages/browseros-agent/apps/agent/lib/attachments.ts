/**
 * Composer attachment helpers — validation, image compression, and the
 * client-side payload shape sent to /agents/:id/chat.
 *
 * Image attachments travel as `data:` URLs (base64) so the gateway, which
 * runs on 127.0.0.1 over Lima virtiofs, can ingest them as standard
 * OpenAI-style content blocks. Non-image text-shaped files are read into
 * memory and travel as their extracted text body — the server inlines
 * them as a fenced `<attachment>` block on the user message.
 */

export const MAX_ATTACHMENTS_PER_MESSAGE = 10
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB after compression
export const MAX_FILE_TEXT_BYTES = 1 * 1024 * 1024 // 1 MB extracted text
export const IMAGE_LONG_EDGE_CAP = 2048

export const ALLOWED_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
] as const

export const ALLOWED_FILE_MEDIA_TYPE_PREFIXES = [
  'text/',
  'application/json',
  'application/pdf',
] as const

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  markdown: 'text/markdown',
  pdf: 'application/pdf',
  txt: 'text/plain',
}

export type ServerImageAttachment = {
  kind: 'image'
  mediaType: string
  dataUrl: string
  name?: string
}

export type ServerFileAttachment = {
  kind: 'file'
  mediaType: string
  name: string
  text: string
}

export type ServerAttachmentPayload =
  | ServerImageAttachment
  | ServerFileAttachment

/** UI-side representation: what the composer needs to render a chip. */
export interface StagedAttachment {
  id: string
  kind: 'image' | 'file'
  mediaType: string
  name: string
  // Set for images so the chip thumbnail can render directly. For files
  // we don't need a preview yet, but the field exists for v2 PDF previews.
  dataUrl?: string
  // Pre-computed payload for the server. Built once at staging time so
  // re-renders don't re-encode large blobs.
  payload: ServerAttachmentPayload
}

export type AttachmentValidationError =
  | { code: 'too_many'; message: string }
  | { code: 'unsupported_type'; message: string; mediaType: string }
  | { code: 'too_large'; message: string }
  | { code: 'read_failed'; message: string }

export type StageAttachmentResult =
  | { ok: true; attachment: StagedAttachment }
  | { ok: false; error: AttachmentValidationError }

function isImageMediaType(mediaType: string): boolean {
  return (ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)
}

function isAllowedFileMediaType(mediaType: string): boolean {
  return ALLOWED_FILE_MEDIA_TYPE_PREFIXES.some((prefix) =>
    mediaType.startsWith(prefix),
  )
}

function inferMediaType(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension
    ? (EXTENSION_MEDIA_TYPES[extension] ?? 'application/octet-stream')
    : 'application/octet-stream'
}

/** Build a unique id without depending on `crypto.randomUUID` outside DOM. */
function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Read a `File` and produce the staged-attachment shape — validate type,
 * compress if it's a large image, and pre-build the server payload.
 */
export async function stageAttachment(
  file: File,
): Promise<StageAttachmentResult> {
  const mediaType = inferMediaType(file)

  if (isImageMediaType(mediaType)) {
    try {
      const compressed = await compressImageIfNeeded(file)
      const dataUrl = await readAsDataUrl(compressed)
      const encodedMediaType = compressed.type || mediaType
      // Rough byte ceiling — `data:image/png;base64,...` doubles size with
      // base64. Reject early so we never POST something the route will 400.
      if (dataUrl.length > MAX_IMAGE_BYTES * 2) {
        return {
          ok: false,
          error: {
            code: 'too_large',
            message: `Image "${file.name}" is too large (max ${humanBytes(
              MAX_IMAGE_BYTES,
            )}).`,
          },
        }
      }
      return {
        ok: true,
        attachment: {
          id: makeId(),
          kind: 'image',
          mediaType: encodedMediaType,
          name: file.name || 'image',
          dataUrl,
          payload: {
            kind: 'image',
            mediaType: encodedMediaType,
            dataUrl,
            name: file.name || undefined,
          },
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'read_failed',
          message:
            err instanceof Error
              ? err.message
              : `Failed to read image "${file.name}".`,
        },
      }
    }
  }

  if (isAllowedFileMediaType(mediaType)) {
    let text: string
    try {
      text =
        mediaType === 'application/pdf'
          ? await extractPdfText(file)
          : await file.text()
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'read_failed',
          message:
            err instanceof Error
              ? err.message
              : `Failed to read file "${file.name}".`,
        },
      }
    }
    if (text.length > MAX_FILE_TEXT_BYTES) {
      return {
        ok: false,
        error: {
          code: 'too_large',
          message: `File "${file.name}" is too large (max ${humanBytes(
            MAX_FILE_TEXT_BYTES,
          )}).`,
        },
      }
    }
    return {
      ok: true,
      attachment: {
        id: makeId(),
        kind: 'file',
        mediaType,
        name: file.name || 'attachment',
        payload: {
          kind: 'file',
          mediaType,
          name: file.name || 'attachment',
          text,
        },
      },
    }
  }

  return {
    ok: false,
    error: {
      code: 'unsupported_type',
      message: `Unsupported attachment type: ${mediaType || 'unknown'}`,
      mediaType,
    },
  }
}

/**
 * Stage multiple files at once, enforcing the per-message cap. The result
 * partitions successful stages and any errors so the caller can show
 * granular toasts.
 */
export async function stageAttachments(
  files: File[],
  alreadyStaged: number,
): Promise<{
  staged: StagedAttachment[]
  errors: AttachmentValidationError[]
}> {
  const remainingSlots = Math.max(
    0,
    MAX_ATTACHMENTS_PER_MESSAGE - alreadyStaged,
  )
  const staged: StagedAttachment[] = []
  const errors: AttachmentValidationError[] = []

  if (remainingSlots === 0 && files.length > 0) {
    errors.push({
      code: 'too_many',
      message: `At most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`,
    })
    return { staged, errors }
  }

  const overflow = files.length - remainingSlots
  if (overflow > 0) {
    errors.push({
      code: 'too_many',
      message: `Only the first ${remainingSlots} of ${files.length} files were attached (max ${MAX_ATTACHMENTS_PER_MESSAGE}).`,
    })
  }

  for (const file of files.slice(0, remainingSlots)) {
    const result = await stageAttachment(file)
    if (result.ok) {
      staged.push(result.attachment)
    } else {
      errors.push(result.error)
    }
  }

  return { staged, errors }
}

/**
 * Resize images that are oversized to a sane long-edge cap. JPEG/WebP
 * source files are re-encoded to JPEG; PNGs/GIFs that are already small
 * are passed through untouched.
 */
export async function compressImageIfNeeded(file: File): Promise<Blob> {
  // Cheap path: small files don't need any transform.
  if (file.size <= 1.5 * 1024 * 1024) return file

  const bitmap = await blobToImageBitmap(file)
  const { width, height } = bitmap
  const longEdge = Math.max(width, height)
  if (longEdge <= IMAGE_LONG_EDGE_CAP && file.size <= MAX_IMAGE_BYTES) {
    bitmap.close?.()
    return file
  }

  const scale = Math.min(1, IMAGE_LONG_EDGE_CAP / longEdge)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetWidth, targetHeight)
      : Object.assign(document.createElement('canvas'), {
          width: targetWidth,
          height: targetHeight,
        })

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  bitmap.close?.()

  const outputType = 'image/jpeg'
  if (canvas instanceof HTMLCanvasElement) {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Image compression failed.'))
        },
        outputType,
        0.85,
      )
    })
  }
  return await (canvas as OffscreenCanvas).convertToBlob({
    type: outputType,
    quality: 0.85,
  })
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }
  // Fallback: load via an Image element and use the canvas decode path.
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () =>
        reject(new Error('Failed to decode image for compression.'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable.')
    ctx.drawImage(img, 0, 0)
    const blobOut = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blobOut) throw new Error('Canvas toBlob returned null.')
    return await createImageBitmap(blobOut)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function readAsDataUrl(blob: Blob): Promise<string> {
  if ('arrayBuffer' in blob && typeof FileReader === 'undefined') {
    const buffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    const type = blob.type || 'application/octet-stream'
    return `data:${type};base64,${base64}`
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed to read blob.'))
    reader.readAsDataURL(blob)
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength))),
    )
  }
  return btoa(binary)
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const source = decodeBytesAsLatin1(new Uint8Array(buffer))
  const strings = [
    ...extractPdfLiteralStrings(source),
    ...extractPdfHexStrings(source),
  ]
    .map(normalizePdfText)
    .filter((text) => text.length > 0)

  if (strings.length === 0) {
    return `[PDF attachment: ${file.name || 'attachment.pdf'}]\nNo extractable text was found in this PDF.`
  }

  return strings.join('\n').slice(0, MAX_FILE_TEXT_BYTES)
}

function decodeBytesAsLatin1(bytes: Uint8Array): string {
  let text = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    text += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength))),
    )
  }
  return text
}

function extractPdfLiteralStrings(source: string): string[] {
  const strings: string[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== '(') {
      i += 1
      continue
    }
    i += 1
    let depth = 1
    let value = ''
    while (i < source.length && depth > 0) {
      const char = source[i]
      if (char === '\\') {
        const next = source[i + 1]
        if (next) value += unescapePdfChar(next)
        i += 2
        continue
      }
      if (char === '(') {
        depth += 1
        value += char
        i += 1
        continue
      }
      if (char === ')') {
        depth -= 1
        if (depth > 0) value += char
        i += 1
        continue
      }
      value += char
      i += 1
    }
    strings.push(value)
  }
  return strings
}

function extractPdfHexStrings(source: string): string[] {
  const strings: string[] = []
  const matches = source.matchAll(/<([0-9a-fA-F\s]{8,})>/g)
  for (const match of matches) {
    const hex = match[1]?.replace(/\s+/g, '')
    if (!hex || hex.length % 2 !== 0) continue
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
    }
    strings.push(decodeBytesAsLatin1(bytes))
  }
  return strings
}

function unescapePdfChar(char: string): string {
  switch (char) {
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    case 'b':
      return '\b'
    case 'f':
      return '\f'
    default:
      return char
  }
}

function replacePdfControlChars(text: string): string {
  let normalized = ''
  let replacedControlRun = false

  for (const char of text) {
    const code = char.charCodeAt(0)
    const isPdfControlChar =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f)

    if (isPdfControlChar) {
      if (!replacedControlRun) normalized += ' '
      replacedControlRun = true
      continue
    }

    normalized += char
    replacedControlRun = false
  }

  return normalized
}

function normalizePdfText(text: string): string {
  return replacePdfControlChars(text.replace(/\r/g, '\n'))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}
