import { describe, expect, it } from 'bun:test'
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_FILE_TEXT_BYTES,
  stageAttachment,
  stageAttachments,
} from './attachments'

function restoreGlobal(name: string, value: unknown) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name)
    return
  }
  Reflect.set(globalThis, name, value)
}

describe('stageAttachment', () => {
  it('infers allowed text media types from extension when File.type is missing', async () => {
    const file = new File(['airport,city\nKJFK,New York'], 'airports.csv', {
      type: '',
    })

    const result = await stageAttachment(file)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.attachment.kind).toBe('file')
    expect(result.attachment.mediaType).toBe('text/csv')
    expect(result.attachment.payload).toMatchObject({
      kind: 'file',
      mediaType: 'text/csv',
      name: 'airports.csv',
      text: 'airport,city\nKJFK,New York',
    })
  })

  it('extracts basic text from PDF attachments', async () => {
    const file = new File(
      [
        '%PDF-1.7\n1 0 obj\nstream\nBT (Airport chart text) Tj <4865782074657874> Tj ET\nendstream\nendobj',
      ],
      'chart.pdf',
      { type: 'application/pdf' },
    )

    const result = await stageAttachment(file)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    const extractedText =
      result.attachment.payload.kind === 'file'
        ? result.attachment.payload.text
        : ''
    expect(result.attachment.kind).toBe('file')
    expect(result.attachment.mediaType).toBe('application/pdf')
    expect(result.attachment.payload).toMatchObject({
      kind: 'file',
      mediaType: 'application/pdf',
      name: 'chart.pdf',
      text: expect.stringContaining('Airport chart text'),
    })
    expect(extractedText.includes('Airport chart text')).toBe(true)
  })

  it('uses the recompressed blob media type for large images', async () => {
    const originalCreateImageBitmap = Reflect.get(
      globalThis,
      'createImageBitmap',
    )
    const originalOffscreenCanvas = Reflect.get(globalThis, 'OffscreenCanvas')
    const originalHTMLCanvasElement = Reflect.get(
      globalThis,
      'HTMLCanvasElement',
    )

    class FakeOffscreenCanvas {
      width: number
      height: number

      constructor(width: number, height: number) {
        this.width = width
        this.height = height
      }

      getContext() {
        return {
          drawImage() {},
        }
      }

      async convertToBlob(options: { type?: string }) {
        return new Blob([new Uint8Array([9, 8, 7])], {
          type: options.type ?? 'image/jpeg',
        })
      }
    }

    try {
      Reflect.set(globalThis, 'createImageBitmap', async () => ({
        width: 4096,
        height: 2048,
        close() {},
      }))
      Reflect.set(globalThis, 'OffscreenCanvas', FakeOffscreenCanvas)
      Reflect.set(globalThis, 'HTMLCanvasElement', class HTMLCanvasElement {})

      const file = new File([new Uint8Array(2 * 1024 * 1024)], 'shot.png', {
        type: 'image/png',
      })

      const result = await stageAttachment(file)

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error.message)
      expect(result.attachment.mediaType).toBe('image/jpeg')
      expect(result.attachment.dataUrl).toStartWith('data:image/jpeg;base64,')
      expect(result.attachment.payload).toMatchObject({
        kind: 'image',
        mediaType: 'image/jpeg',
        dataUrl: result.attachment.dataUrl,
      })
    } finally {
      restoreGlobal('createImageBitmap', originalCreateImageBitmap)
      restoreGlobal('OffscreenCanvas', originalOffscreenCanvas)
      restoreGlobal('HTMLCanvasElement', originalHTMLCanvasElement)
    }
  })

  it('rejects unsupported files', async () => {
    const result = await stageAttachment(
      new File(['binary-ish'], 'archive.zip', {
        type: 'application/zip',
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected unsupported attachment to fail')
    expect(result.error).toMatchObject({
      code: 'unsupported_type',
      mediaType: 'application/zip',
    })
  })

  it('rejects oversized text-shaped file attachments', async () => {
    const result = await stageAttachment(
      new File(['x'.repeat(MAX_FILE_TEXT_BYTES + 1)], 'large-notes.txt', {
        type: 'text/plain',
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected oversized attachment to fail')
    expect(result.error).toMatchObject({
      code: 'too_large',
      message: expect.stringContaining('large-notes.txt'),
    })
  })

  it('enforces the per-message attachment cap while preserving accepted files', async () => {
    const files = Array.from(
      { length: 3 },
      (_, index) =>
        new File([`file ${index}`], `file-${index}.txt`, {
          type: 'text/plain',
        }),
    )

    const result = await stageAttachments(
      files,
      MAX_ATTACHMENTS_PER_MESSAGE - 1,
    )

    expect(result.staged).toHaveLength(1)
    expect(result.staged[0]?.name).toBe('file-0.txt')
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'too_many',
        message: expect.stringContaining('Only the first 1 of 3 files'),
      }),
    ])
  })
})
