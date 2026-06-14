import { describe, expect, it } from 'bun:test'
import { isLiveMcpServer, type McpServer } from './mcpServerTypes'

describe('isLiveMcpServer', () => {
  it('treats managed catalog entries with local connector URLs as live tools', () => {
    const server: McpServer = {
      id: 'gmail-local',
      displayName: 'Gmail',
      type: 'managed',
      managedServerName: 'Gmail',
      connectionMode: 'local_catalog',
      config: {
        url: 'http://localhost:8000/sse',
      },
    }

    expect(isLiveMcpServer(server)).toBe(true)
  })

  it('does not treat remote MCP URLs as live tools in the private build', () => {
    const server: McpServer = {
      id: 'remote',
      displayName: 'Remote',
      type: 'custom',
      config: {
        url: 'https://mcp.example.com/sse',
      },
    }

    expect(isLiveMcpServer(server)).toBe(false)
  })

  it('keeps plain catalog entries non-live until a local connector is set', () => {
    const server: McpServer = {
      id: 'gmail-catalog',
      displayName: 'Gmail',
      type: 'managed',
      managedServerName: 'Gmail',
      connectionMode: 'local_catalog',
    }

    expect(isLiveMcpServer(server)).toBe(false)
  })
})
