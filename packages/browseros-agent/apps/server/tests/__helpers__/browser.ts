/**
 * @license
 * Copyright 2025 BrowserOS
 *
 * Low-level PannamOS process management.
 * Use setup.ts:ensureBrowserOS() for the full test environment.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const TEST_USER_DATA_PREFIX = 'pannamos-test-'

export interface BrowserConfig {
  cdpPort: number
  serverPort: number
  extensionPort: number
  binaryPath: string
  userDataDir: string
  headless: boolean
  extraArgs: string[]
}

interface BrowserState {
  process: ChildProcess
  userDataDir: string
  config: BrowserConfig
}

let browserState: BrowserState | null = null

function shouldLogBrowserOutput(): boolean {
  return (
    process.env.CI === 'true' || process.env.BROWSEROS_TEST_DEBUG === 'true'
  )
}

export async function isBrowserRunning(cdpPort: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, {
      signal: AbortSignal.timeout(1000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitForCdp(cdpPort: number, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isBrowserRunning(cdpPort)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`CDP failed to start on port ${cdpPort} within timeout`)
}

export function getBrowserState(): BrowserState | null {
  return browserState
}

function killOrphanedTestBrowsers(): void {
  // Matches only PannamOS processes launched with a test user-data-dir
  // (e.g., /var/folders/.../pannamos-test-XXXX). Never matches a dev
  // PannamOS run from ~/Library/Application Support/PannamOS.
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      [
        'Get-CimInstance Win32_Process',
        `Where-Object { $_.CommandLine -like '*${TEST_USER_DATA_PREFIX}*' -and ($_.Name -like 'chrome*' -or $_.Name -like 'PannamOS*' -or $_.Name -like 'BrowserOS*' -or $_.Name -like 'chromium*') }`,
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
      ].join(' | '),
    ])
    if (result.status === 0) {
      console.log('Killed orphaned test browsers from a previous run')
    }
    return
  }

  const result = spawnSync('pkill', ['-9', '-f', TEST_USER_DATA_PREFIX])
  if (result.status === 0) {
    console.log('Killed orphaned test browsers from a previous run')
  }
}

export async function spawnBrowser(
  config: BrowserConfig,
): Promise<BrowserState> {
  if (browserState && browserState.config.cdpPort === config.cdpPort) {
    if (await isBrowserRunning(config.cdpPort)) {
      console.log(`Reusing existing browser on CDP port ${config.cdpPort}`)
      return browserState
    }
  }

  if (browserState) {
    console.log('Config changed, cleaning up existing browser...')
    await killBrowser()
  }

  killOrphanedTestBrowsers()

  console.log(`Starting PannamOS on CDP port ${config.cdpPort}...`)
  const browserProcess = spawn(
    config.binaryPath,
    [
      '--no-first-run',
      '--no-default-browser-check',
      '--use-mock-keychain',
      '--show-component-extension-options',
      // Match the supported dev/eval launch path and keep legacy upstream
      // extensions from trying to talk to the removed controller bridge.
      '--disable-browseros-extensions',
      '--browseros-dock-icon=dev',
      '--enable-logging=stderr',
      ...(config.headless ? ['--headless=new'] : []),
      ...config.extraArgs,
      `--user-data-dir=${config.userDataDir}`,
      // TODO: replace with --browseros-cdp-port once we fix the browseros bug
      `--remote-debugging-port=${config.cdpPort}`,
      `--browseros-mcp-port=${config.serverPort}`,
      `--browseros-extension-port=${config.extensionPort}`,
      '--disable-browseros-server',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  browserProcess.stdout?.on('data', (data) => {
    if (!shouldLogBrowserOutput()) {
      return
    }
    console.log(`[BROWSER] ${data.toString().trim()}`)
  })

  browserProcess.stderr?.on('data', (data) => {
    if (!shouldLogBrowserOutput()) {
      return
    }
    console.error(`[BROWSER] ${data.toString().trim()}`)
  })

  browserProcess.on('error', (error) => {
    console.error('Failed to start PannamOS:', error)
  })

  browserState = {
    process: browserProcess,
    userDataDir: config.userDataDir,
    config,
  }

  console.log('Waiting for CDP to be ready...')
  try {
    await waitForCdp(config.cdpPort)
  } catch (error) {
    await killBrowser()
    throw error
  }
  console.log('CDP is ready')
  return browserState
}

export async function killBrowser(): Promise<void> {
  if (!browserState) {
    return
  }

  console.log('Shutting down PannamOS...')
  if (process.platform === 'win32' && browserState.process.pid) {
    spawnSync('taskkill.exe', [
      '/PID',
      String(browserState.process.pid),
      '/T',
      '/F',
    ])
  } else {
    browserState.process.kill('SIGTERM')
  }

  if (
    browserState.process.exitCode === null &&
    browserState.process.signalCode === null
  ) {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        browserState?.process.kill('SIGKILL')
        resolve()
      }, 5000)

      browserState?.process.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  console.log('PannamOS stopped')

  if (browserState.userDataDir) {
    console.log(`Cleaning up temp profile: ${browserState.userDataDir}`)
    try {
      rmSync(browserState.userDataDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to clean up temp directory:', error)
    }
  }

  browserState = null
}
