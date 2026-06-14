/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { registerTools } from '../../../../src/api/services/mcp/register-mcp'
import { defineTool } from '../../../../src/tools/framework'
import { createRegistry } from '../../../../src/tools/tool-registry'

describe('registerTools', () => {
  it('can restrict MCP tool registration to a read-only allowlist', () => {
    const registered: string[] = []
    const mcpServer = {
      registerTool(name: string) {
        registered.push(name)
      },
    } as unknown as McpServer
    const registry = createRegistry([
      testTool('list_pages'),
      testTool('take_snapshot'),
      testTool('click'),
      testTool('evaluate_script'),
    ])

    registerTools(mcpServer, registry, {
      browser: {} as never,
      directories: {},
      allowedToolNames: new Set(['list_pages', 'take_snapshot']),
    })

    expect(registered).toEqual(['list_pages', 'take_snapshot'])
  })
})

function testTool(name: string) {
  return defineTool({
    name,
    description: `${name} test tool`,
    input: z.object({}),
    async handler(_args, _ctx, response) {
      response.text('ok')
    },
  })
}
