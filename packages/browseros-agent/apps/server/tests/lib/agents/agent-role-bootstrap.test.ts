/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bootstrapAgentRole,
  listLocalAgentRoleTemplates,
} from '../../../src/lib/agents/agent-role-bootstrap'
import type { AgentDefinition } from '../../../src/lib/agents/agent-types'

const tempDirs: string[] = []

describe('bootstrapAgentRole', () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    )
  })

  it('materializes built-in role templates into the local agent home', async () => {
    const browserosDir = await mkdtemp(join(tmpdir(), 'browseros-role-'))
    tempDirs.push(browserosDir)

    const role = await bootstrapAgentRole({
      browserosDir,
      agent: testAgent(),
      roleId: 'chief-of-staff',
    })

    const agentHome = join(browserosDir, 'agents', 'harness', 'agent-1', 'home')

    expect(role?.roleName).toBe('Chief of Staff')
    await expect(
      readFile(join(agentHome, 'AGENTS.md'), 'utf8'),
    ).resolves.toContain('# Chief of Staff')
    await expect(
      readFile(join(agentHome, 'SOUL.md'), 'utf8'),
    ).resolves.toContain('trusted Chief of Staff')
    await expect(
      readFile(join(agentHome, 'TOOLS.md'), 'utf8'),
    ).resolves.toContain('PannamOS MCP')
    await expect(
      readFile(join(agentHome, 'ROLE.md'), 'utf8'),
    ).resolves.toContain('Send external communications: ask')
  })

  it('lists PannamOS local-first role templates for common agent jobs', () => {
    expect(listLocalAgentRoleTemplates().map((role) => role.id)).toEqual([
      'chief-of-staff',
      'research-analyst',
      'workflow-operator',
      'qa-browser-tester',
      'data-extraction-analyst',
      'knowledge-manager',
    ])
  })

  it('materializes research analyst templates with source-aware guidance', async () => {
    const browserosDir = await mkdtemp(join(tmpdir(), 'browseros-role-'))
    tempDirs.push(browserosDir)

    const role = await bootstrapAgentRole({
      browserosDir,
      agent: testAgent('research-analyst'),
      roleId: 'research-analyst',
    })

    const agentHome = join(browserosDir, 'agents', 'harness', 'agent-1', 'home')

    expect(role?.roleName).toBe('Research Analyst')
    await expect(
      readFile(join(agentHome, 'AGENTS.md'), 'utf8'),
    ).resolves.toContain('source synthesis specialist')
    await expect(
      readFile(join(agentHome, 'TOOLS.md'), 'utf8'),
    ).resolves.toContain('tab-workflows')
    await expect(
      readFile(join(agentHome, 'ROLE.md'), 'utf8'),
    ).resolves.toContain('Use logged-in sources: ask')
  })
})

function testAgent(name = 'chief-of-staff'): AgentDefinition {
  return {
    id: 'agent-1',
    name,
    adapter: 'codex',
    modelId: 'gpt-5.5',
    reasoningEffort: 'medium',
    permissionMode: 'approve-all',
    sessionKey: 'agent:agent-1:main',
    createdAt: 1000,
    updatedAt: 1000,
  }
}
