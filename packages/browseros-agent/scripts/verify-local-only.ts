import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')

const disallowedPatterns = [
  /api\.browseros\.com/i,
  /graph\.browseros\.com/i,
  /llm\.browseros\.com/i,
  /cdn\.browseros\.com/i,
  /files\.browseros\.com/i,
  /docs\.browseros\.com/i,
  /https:\/\/browseros\.com/i,
  /browseros\.com/i,
  /github\.com\/browseros-ai\/BrowserOS\/releases/i,
  /dub\.sh\/browseros/i,
  /discord\.gg\/browseros/i,
  /upload\/presigned-url/i,
  /createAuthClient/i,
  /better-auth\/react/i,
  /SignInHint/i,
  /signInHintDismissedAtStorage/i,
  /activeHint.*signin/i,
]

const sourceTargets = [
  'apps/server/.env.production',
  'apps/server/.env.production.example',
  'apps/agent/.env.example',
  'apps/agent/.env.development',
  'apps/server/src',
  'apps/agent/lib',
  'apps/agent/entrypoints',
  'apps/agent/components',
  'apps/cli/.env.production.example',
  'apps/cli/README.md',
  'apps/cli/cmd',
  'apps/cli/npm/README.md',
  'apps/cli/npm/package.json',
  'apps/cli/npm/scripts',
  'apps/cli/scripts',
  'apps/cli/update',
  'packages/shared/src',
  'scripts/build',
  'tools/dogfood',
]

const distTarget = 'apps/agent/dist/chrome-mv3'

const ignoredDirectoryNames = new Set([
  '.git',
  '.wxt',
  'dist',
  'generated',
  'node_modules',
])

const ignoredExtensions = new Set([
  '.avif',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.map',
  '.png',
  '.svg',
  '.ttf',
  '.webp',
  '.woff',
  '.woff2',
])

interface Match {
  file: string
  line: number
  pattern: string
  text: string
}

function extensionOf(filePath: string) {
  const index = filePath.lastIndexOf('.')
  return index === -1 ? '' : filePath.slice(index).toLowerCase()
}

function collectFiles(targetPath: string, options: { scanDist: boolean }) {
  const absolutePath = resolve(repoRoot, targetPath)
  if (!existsSync(absolutePath)) return []

  const stats = statSync(absolutePath)
  if (stats.isFile()) return [absolutePath]
  if (!stats.isDirectory()) return []

  const files: string[] = []
  const entries = readdirSync(absolutePath)

  for (const entry of entries) {
    const child = join(absolutePath, entry)
    const childStats = statSync(child)
    if (childStats.isDirectory()) {
      if (!options.scanDist && ignoredDirectoryNames.has(entry)) continue
      if (options.scanDist && entry === '.git') continue
      files.push(...collectFiles(relative(repoRoot, child), options))
      continue
    }

    if (!childStats.isFile()) continue
    if (ignoredExtensions.has(extensionOf(child))) continue
    files.push(child)
  }

  return files
}

function scanFile(filePath: string): Match[] {
  const contents = readFileSync(filePath, 'utf8')
  const matches: Match[] = []

  contents.split(/\r?\n/).forEach((lineText, lineIndex) => {
    for (const pattern of disallowedPatterns) {
      if (pattern.test(lineText)) {
        matches.push({
          file: relative(repoRoot, filePath),
          line: lineIndex + 1,
          pattern: pattern.source,
          text: lineText.trim().slice(0, 240),
        })
      }
    }
  })

  return matches
}

function scanTargets(targets: string[], options: { scanDist: boolean }) {
  return targets.flatMap((target) =>
    collectFiles(target, options).flatMap(scanFile),
  )
}

const matches = [
  ...scanTargets(sourceTargets, { scanDist: false }),
  ...scanTargets([distTarget], { scanDist: true }),
]

if (matches.length > 0) {
  console.error('PannamOS local-only verification failed.')
  for (const match of matches) {
    console.error(
      `${match.file}:${match.line} matched /${match.pattern}/: ${match.text}`,
    )
  }
  process.exit(1)
}

console.log('PannamOS local-only verification passed.')
