/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { buildMcpServerSpecs } from '../../src/agent/mcp-builder'
import { clearTransportCache } from '../../src/lib/mcp-transport-detect'

describe('buildMcpServerSpecs', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    clearTransportCache()
  })

  it('keeps loopback MCP servers and skips remote MCP servers in mixed input', async () => {
    const probedUrls: string[] = []
    globalThis.fetch = ((input) => {
      probedUrls.push(String(input))
      return Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }) as typeof fetch

    const specs = await buildMcpServerSpecs({
      browserContext: {
        customMcpServers: [
          {
            name: 'Local Gmail',
            url: 'http://127.0.0.1:7777/sse',
          },
          {
            name: 'Remote Gmail',
            url: 'https://mcp.example.com/sse',
          },
        ],
      },
    })

    expect(probedUrls).toEqual(['http://127.0.0.1:7777/sse'])
    expect(specs).toEqual([
      {
        name: 'custom-Local Gmail',
        url: 'http://127.0.0.1:7777/sse',
        transport: 'streamable-http',
      },
    ])
  })

  it('skips non-loopback custom MCP servers in the private build', async () => {
    globalThis.fetch = (() => {
      throw new Error('remote MCP URL should not be probed')
    }) as typeof fetch

    const specs = await buildMcpServerSpecs({
      browserContext: {
        customMcpServers: [
          {
            name: 'Remote',
            url: 'https://mcp.example.com/sse',
          },
        ],
      },
    })

    expect(specs).toEqual([])
  })
})
