/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { constants, type Dirent } from 'node:fs'
import { access, cp, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { RuntimeSkillDescriptor } from './acpx-runtime-templates'

export interface RepoRuntimeSkill extends RuntimeSkillDescriptor {
  source: 'repo_skill'
  skillDir: string
}

interface DiscoverRepoRuntimeSkillsOptions {
  repoRoot?: string
  skillRoots?: string[]
  startDir?: string
}

const MAX_REPO_ROOT_WALK_DEPTH = 8
const REPO_SKILL_ROOTS = [
  join('.claude', 'skills'),
  join('.agents', 'skills'),
] as const

export async function discoverRepoRuntimeSkills(
  options: DiscoverRepoRuntimeSkillsOptions = {},
): Promise<RepoRuntimeSkill[]> {
  const skillRoots =
    options.skillRoots ??
    (await discoverRepoSkillRoots({
      repoRoot: options.repoRoot,
      startDir: options.startDir,
    }))
  const discovered = new Map<string, RepoRuntimeSkill>()

  for (const root of skillRoots) {
    if (!(await readableDirectoryExists(root))) continue

    for (const skillDir of await findSkillDirectories(root)) {
      const skill = await readRepoRuntimeSkill(skillDir)
      if (!skill || discovered.has(skill.id)) continue
      discovered.set(skill.id, skill)
    }
  }

  return [...discovered.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
}

export async function materializeRepoRuntimeSkill(
  skill: RepoRuntimeSkill,
  targetRoot: string,
): Promise<void> {
  const target = join(targetRoot, skill.id)
  await cp(skill.skillDir, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
}

async function discoverRepoSkillRoots(input: {
  repoRoot?: string
  startDir?: string
}): Promise<string[]> {
  const explicitRepoRoot = input.repoRoot ?? process.env.BROWSEROS_REPO_ROOT
  if (explicitRepoRoot?.trim()) {
    return REPO_SKILL_ROOTS.map((relativePath) =>
      join(resolve(explicitRepoRoot), relativePath),
    )
  }

  return collectRepoSkillRoots(input.startDir ?? process.cwd())
}

async function collectRepoSkillRoots(startDir: string): Promise<string[]> {
  let current = resolve(startDir)
  const roots: string[] = []
  const repoBoundary = await findRepoBoundary(current)

  for (let depth = 0; depth < MAX_REPO_ROOT_WALK_DEPTH; depth += 1) {
    for (const relativePath of REPO_SKILL_ROOTS) {
      const candidate = join(current, relativePath)
      if (await readableDirectoryExists(candidate)) {
        roots.push(candidate)
      }
    }

    if (repoBoundary && current === repoBoundary) return roots

    const parent = dirname(current)
    if (parent === current) return roots
    current = parent
  }

  return roots
}

async function findRepoBoundary(startDir: string): Promise<string | null> {
  let current = resolve(startDir)

  for (let depth = 0; depth < MAX_REPO_ROOT_WALK_DEPTH; depth += 1) {
    if (await readablePathExists(join(current, '.git'))) return current

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }

  return null
}

async function findSkillDirectories(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const skillDirs = await Promise.all(
    entries
      .filter((entry: Dirent) => entry.isDirectory())
      .map(async (entry) => {
        const skillDir = join(root, entry.name)
        return (await readableFileExists(join(skillDir, 'SKILL.md')))
          ? skillDir
          : null
      }),
  )

  return skillDirs.filter((path): path is string => path !== null)
}

async function readRepoRuntimeSkill(
  skillDir: string,
): Promise<RepoRuntimeSkill | null> {
  const skillPath = join(skillDir, 'SKILL.md')
  const content = await readFile(skillPath, 'utf8')
  const frontmatter = parseSkillFrontmatter(content)
  const id = sanitizeSkillName(frontmatter.name ?? basename(skillDir))
  if (!id) return null

  return {
    id,
    name: id,
    description:
      frontmatter.description ?? 'Repository-bundled PannamOS skill.',
    source: 'repo_skill',
    skillDir,
  }
}

function parseSkillFrontmatter(content: string): {
  name?: string
  description?: string
} {
  const normalized = content.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---')) return {}

  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(normalized)
  if (!match) return {}

  const result: { name?: string; description?: string } = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const value = unquoteFrontmatterValue(line.slice(separator + 1).trim())

    if (key === 'name' && value) result.name = value
    if (key === 'description' && value) result.description = value
  }

  return result
}

function unquoteFrontmatterValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function sanitizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function readableDirectoryExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    await access(path, constants.R_OK)
    return info.isDirectory()
  } catch {
    return false
  }
}

async function readablePathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    await access(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function readableFileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    await access(path, constants.R_OK)
    return info.isFile()
  } catch {
    return false
  }
}
