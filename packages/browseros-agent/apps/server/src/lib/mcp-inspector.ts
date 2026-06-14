/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createMCPClient } from '@ai-sdk/mcp'
import { TIMEOUTS } from '@browseros/shared/constants/timeouts'
import type { ToolSet } from 'ai'
import { detectMcpTransport } from './mcp-transport-detect'

export interface McpToolPreview {
  name: string
  description?: string
}

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = TIMEOUTS.MCP_CLIENT_CONNECT,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ])
}

function toToolPreviews(toolSet: ToolSet): McpToolPreview[] {
  return Object.entries(toolSet)
    .map(([name, tool]) => {
      const description =
        typeof tool.description === 'string' ? tool.description : undefined
      return {
        name,
        ...(description ? { description } : {}),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function inspectMcpServerTools(
  serverUrl: string,
): Promise<McpToolPreview[]> {
  const transportType = await detectMcpTransport(serverUrl)
  const client = await withTimeout(
    createMCPClient({
      transport: {
        type: transportType === 'sse' ? 'sse' : 'http',
        url: serverUrl,
      },
    }),
    'MCP connector check',
  )

  try {
    const tools = await withTimeout(client.tools(), 'MCP connector tools/list')
    return toToolPreviews(tools)
  } finally {
    await client.close().catch(() => {})
  }
}
