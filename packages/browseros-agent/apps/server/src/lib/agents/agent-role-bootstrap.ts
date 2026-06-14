/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  BROWSEROS_ROLE_TEMPLATES,
  getBrowserOSRoleTemplate,
} from '@browseros/shared/constants/role-aware-agents'
import type {
  BrowserOSAgentRoleId,
  BrowserOSAgentRoleSummary,
  BrowserOSCustomRoleInput,
  BrowserOSRoleBoundary,
  BrowserOSRoleTemplate,
} from '@browseros/shared/types/role-aware-agents'
import { resolveAgentRuntimePaths } from './acpx-runtime-context'
import type { AgentDefinition } from './agent-types'

export interface AgentRoleBootstrapInput {
  browserosDir: string
  agent: AgentDefinition
  roleId?: BrowserOSAgentRoleId
  customRole?: BrowserOSCustomRoleInput
}

export interface ResolvedAgentRoleBootstrap {
  roleName: string
  shortDescription: string
  agentsMd: string
  soulMd: string
  toolsMd: string
  boundaries: BrowserOSRoleBoundary[]
}

export function listLocalAgentRoleTemplates(): BrowserOSRoleTemplate[] {
  return BROWSEROS_ROLE_TEMPLATES
}

export function resolveAgentRoleBootstrap(input: {
  roleId?: BrowserOSAgentRoleId
  customRole?: BrowserOSCustomRoleInput
}): ResolvedAgentRoleBootstrap | null {
  if (input.customRole) return resolveCustomRoleBootstrap(input.customRole)
  if (!input.roleId) return null

  const template = getBrowserOSRoleTemplate(input.roleId)
  if (!template) return null

  return {
    roleName: template.name,
    shortDescription: template.shortDescription,
    agentsMd: template.bootstrap.agentsMd,
    soulMd: template.bootstrap.soulMd,
    toolsMd: template.bootstrap.toolsMd,
    boundaries: template.boundaries,
  }
}

export function summarizeAgentRole(input: {
  roleId?: BrowserOSAgentRoleId
  customRole?: BrowserOSCustomRoleInput
}): BrowserOSAgentRoleSummary | undefined {
  if (input.customRole) {
    return {
      roleSource: 'custom',
      roleName: input.customRole.name,
      shortDescription: input.customRole.shortDescription,
    }
  }
  if (!input.roleId) return undefined

  const template = getBrowserOSRoleTemplate(input.roleId)
  if (!template) return undefined

  return {
    roleSource: 'builtin',
    roleId: template.id,
    roleName: template.name,
    shortDescription: template.shortDescription,
  }
}

export async function bootstrapAgentRole(
  input: AgentRoleBootstrapInput,
): Promise<ResolvedAgentRoleBootstrap | null> {
  const role = resolveAgentRoleBootstrap(input)
  if (!role) return null

  const paths = resolveAgentRuntimePaths({
    browserosDir: input.browserosDir,
    agentId: input.agent.id,
  })

  await writeFileIfMissing(join(paths.agentHome, 'AGENTS.md'), role.agentsMd)
  await writeFileIfMissing(join(paths.agentHome, 'SOUL.md'), role.soulMd)
  await writeFileIfMissing(join(paths.agentHome, 'TOOLS.md'), role.toolsMd)
  await writeFileIfMissing(
    join(paths.agentHome, 'ROLE.md'),
    buildRoleSummaryMarkdown(role),
  )

  return role
}

function resolveCustomRoleBootstrap(
  role: BrowserOSCustomRoleInput,
): ResolvedAgentRoleBootstrap {
  return {
    roleName: role.name,
    shortDescription: role.shortDescription,
    agentsMd:
      role.bootstrap?.agentsMd ?? `# ${role.name}\n\n${role.longDescription}\n`,
    soulMd:
      role.bootstrap?.soulMd ??
      `# Operating Style\n\nYou act as ${role.name}.\n`,
    toolsMd:
      role.bootstrap?.toolsMd ??
      '# Tooling Guidelines\n\nUse local PannamOS tools and ask before risky actions.\n',
    boundaries: role.boundaries,
  }
}

function buildRoleSummaryMarkdown(role: ResolvedAgentRoleBootstrap): string {
  const boundaries =
    role.boundaries.length > 0
      ? role.boundaries
          .map(
            (boundary) =>
              `- ${boundary.label}: ${boundary.defaultMode} - ${boundary.description}`,
          )
          .join('\n')
      : '- No explicit boundaries configured.'

  return `# Role

${role.roleName}

${role.shortDescription}

## Boundaries

${boundaries}
`
}

async function writeFileIfMissing(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err
  }
}

function isAlreadyExistsError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'EEXIST'
  )
}
