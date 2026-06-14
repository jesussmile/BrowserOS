/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverRepoRuntimeSkills } from '../../../src/lib/agents/repo-runtime-skills'

describe('repo runtime skill discovery', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    )
    tempDirs.length = 0
  })

  it('stops at the repository boundary and does not import user-global skills', async () => {
    const userHome = await mkdtemp(join(tmpdir(), 'browseros-user-home-'))
    tempDirs.push(userHome)
    const repoRoot = join(userHome, 'BrowserOS')
    const packageRoot = join(repoRoot, 'packages', 'browseros-agent')
    await mkdir(join(repoRoot, '.git'), { recursive: true })
    await writeSkill(join(userHome, '.claude', 'skills', 'global-skill'), {
      name: 'global-skill',
      description: 'Should stay outside BrowserOS.',
    })
    await writeSkill(join(repoRoot, '.claude', 'skills', 'repo-skill'), {
      name: 'repo-skill',
      description: 'Repo root skill.',
    })
    await writeSkill(join(packageRoot, '.claude', 'skills', 'package-skill'), {
      name: 'package-skill',
      description: 'Package skill.',
    })

    const skills = await discoverRepoRuntimeSkills({ startDir: packageRoot })

    expect(skills.map((skill) => skill.id)).toEqual([
      'package-skill',
      'repo-skill',
    ])
  })
})

async function writeSkill(
  dir: string,
  frontmatter: { name: string; description: string },
) {
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---
name: ${frontmatter.name}
description: ${frontmatter.description}
---

# ${frontmatter.name}
`,
  )
}
