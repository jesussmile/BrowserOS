/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface FakeSshResponse {
  stdout?: string
  stderr?: string
  exit?: number
}

export async function fakeSsh(
  response: FakeSshResponse = {},
  logPath?: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fake-ssh-'))
  if (process.platform === 'win32') {
    return fakeSshForWindows(dir, response, logPath)
  }

  const path = join(dir, 'ssh')
  const body = `#!/usr/bin/env bash
set -u
echo "ARGS:$*" >> "${logPath ?? '/dev/null'}"
printf %b ${JSON.stringify(response.stdout ?? '')}
printf %b ${JSON.stringify(response.stderr ?? '')} >&2
exit ${response.exit ?? 0}
`
  await writeFile(path, body)
  await chmod(path, 0o755)
  return path
}

async function fakeSshForWindows(
  dir: string,
  response: FakeSshResponse,
  logPath?: string,
): Promise<string> {
  const path = join(dir, 'ssh.cmd')
  const scriptPath = join(dir, 'ssh.mjs')
  const script = `import { appendFileSync } from 'node:fs'

const response = ${JSON.stringify(response)}
const logPath = ${JSON.stringify(logPath ?? null)}
const args = process.argv.slice(2)

if (logPath) appendFileSync(logPath, 'ARGS:' + args.join(' ') + '\\n')
process.stdout.write(response.stdout ?? '')
process.stderr.write(response.stderr ?? '')
process.exit(response.exit ?? 0)
`
  await writeFile(scriptPath, script)
  await writeFile(path, `@"${process.execPath}" "${scriptPath}" %*\r\n`)
  return path
}
