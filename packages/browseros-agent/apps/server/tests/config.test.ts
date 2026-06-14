/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, beforeEach, describe, it } from 'bun:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PATHS } from '@browseros/shared/constants/paths'

import { loadServerConfig } from '../src/config'

describe('loadServerConfig', () => {
  let tempDir: string
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browseros-config-test-'))
    originalEnv = { ...process.env }

    // Clear relevant env vars
    delete process.env.BROWSEROS_CDP_PORT
    delete process.env.BROWSEROS_SERVER_PORT
    delete process.env.BROWSEROS_EXTENSION_PORT
    delete process.env.BROWSEROS_RESOURCES_DIR
    delete process.env.BROWSEROS_EXECUTION_DIR
    delete process.env.PANNAMOS_STORAGE_ROOT
    delete process.env.PANNAMOS_OUTPUTS_DIR
    delete process.env.BROWSEROS_INSTALL_ID
    delete process.env.BROWSEROS_CLIENT_ID
    delete process.env.BROWSEROS_AI_SDK_DEVTOOLS
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
    process.env = originalEnv
  })

  describe('CLI parsing', () => {
    it('parses all CLI args', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--cdp-port=9222',
        '--server-port=9223',
        '--extension-port=9224',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, 9222)
      assert.strictEqual(result.value.serverPort, 9223)
      // agentPort is deprecated - always equals serverPort
      assert.strictEqual(result.value.agentPort, 9223)
      assert.strictEqual(result.value.extensionPort, 9224)
      assert.strictEqual(result.value.mcpAllowRemote, false)
    })

    it('parses --allow-remote-in-mcp flag', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=9223',
        '--allow-remote-in-mcp',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.mcpAllowRemote, true)
    })

    it('cdp-port is optional (nullable)', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=9223',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, null)
      assert.strictEqual(result.value.extensionPort, null)
    })

    it('parses Bun compiled executable args', () => {
      const result = loadServerConfig([
        'browseros_server.exe',
        '--cdp-port=9222',
        '--server-port=9223',
        '--extension-port=9224',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, 9222)
      assert.strictEqual(result.value.serverPort, 9223)
      assert.strictEqual(result.value.agentPort, 9223)
      assert.strictEqual(result.value.extensionPort, 9224)
    })

    it('parses direct user args for tests and embedded callers', () => {
      const result = loadServerConfig(['--cdp-port=9222', '--server-port=9223'])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, 9222)
      assert.strictEqual(result.value.serverPort, 9223)
    })

    it('warns when --extension-port is provided', () => {
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (message?: unknown) => {
        warnings.push(String(message))
      }

      try {
        const result = loadServerConfig([
          'bun',
          'src/index.ts',
          '--server-port=9223',
          '--extension-port=9224',
        ])

        assert.strictEqual(result.ok, true)
        assert.deepStrictEqual(warnings, [
          'Warning: --extension-port is deprecated and has no effect.',
        ])
      } finally {
        console.warn = originalWarn
      }
    })
  })

  describe('environment variables', () => {
    it('reads from env when CLI not provided', () => {
      process.env.BROWSEROS_CDP_PORT = '9222'
      process.env.BROWSEROS_SERVER_PORT = '9223'
      process.env.BROWSEROS_EXTENSION_PORT = '9224'

      const result = loadServerConfig(['bun', 'src/index.ts'])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, 9222)
      assert.strictEqual(result.value.serverPort, 9223)
      // agentPort is deprecated - always equals serverPort
      assert.strictEqual(result.value.agentPort, 9223)
      assert.strictEqual(result.value.extensionPort, 9224)
    })

    it('CLI takes precedence over env', () => {
      process.env.BROWSEROS_SERVER_PORT = '9999'
      process.env.BROWSEROS_EXTENSION_PORT = '9999'

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=1111',
        '--extension-port=3333',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.serverPort, 1111)
      // agentPort is deprecated - always equals serverPort
      assert.strictEqual(result.value.agentPort, 1111)
      assert.strictEqual(result.value.extensionPort, 3333)
    })

    it('reads storage root and outputs directory from env', () => {
      process.env.PANNAMOS_STORAGE_ROOT = path.join(tempDir, 'root')
      process.env.PANNAMOS_OUTPUTS_DIR = path.join(tempDir, 'outputs')

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.storageRoot, path.join(tempDir, 'root'))
      assert.strictEqual(
        result.value.executionDir,
        path.join(tempDir, 'root', PATHS.SERVER_STATE_DIR_NAME),
      )
      assert.strictEqual(result.value.outputsDir, path.join(tempDir, 'outputs'))
    })
  })

  describe('config file loading', () => {
    it('loads config from --config path', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: {
            cdp: 9222,
            http_mcp: 3000,
            extension: 3002,
          },
          flags: {
            allow_remote_in_mcp: true,
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, 9222)
      assert.strictEqual(result.value.serverPort, 3000)
      // agentPort is deprecated - always equals serverPort
      assert.strictEqual(result.value.agentPort, 3000)
      assert.strictEqual(result.value.extensionPort, 3002)
      assert.strictEqual(result.value.mcpAllowRemote, true)
    })

    it('CLI takes precedence over config file', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: {
            http_mcp: 3000,
            extension: 3002,
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
        '--server-port=9999',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.serverPort, 9999)
      // agentPort is deprecated - always equals serverPort
      assert.strictEqual(result.value.agentPort, 9999)
    })

    it('config file takes precedence over env', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: {
            http_mcp: 3000,
            extension: 3002,
          },
        }),
      )

      process.env.BROWSEROS_SERVER_PORT = '9999'

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.serverPort, 3000)
    })

    it('resolves relative paths in config file', () => {
      const subdir = path.join(tempDir, 'subdir')
      fs.mkdirSync(subdir)
      const configPath = path.join(subdir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: { http_mcp: 3000, extension: 3002 },
          directories: {
            resources: '../data',
            storage_root: './pannamos-root',
            execution: './logs',
            outputs: './generated',
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.resourcesDir, path.join(tempDir, 'data'))
      assert.strictEqual(
        result.value.storageRoot,
        path.join(subdir, 'pannamos-root'),
      )
      assert.strictEqual(result.value.executionDir, path.join(subdir, 'logs'))
      assert.strictEqual(
        result.value.outputsDir,
        path.join(subdir, 'generated'),
      )
    })

    it('derives execution and outputs directories from storage_root', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: { http_mcp: 3000, extension: 3002 },
          directories: {
            storage_root: './pannamos-root',
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      const root = path.join(tempDir, 'pannamos-root')
      assert.strictEqual(result.value.storageRoot, root)
      assert.strictEqual(
        result.value.executionDir,
        path.join(root, PATHS.SERVER_STATE_DIR_NAME),
      )
      assert.strictEqual(
        result.value.outputsDir,
        path.join(root, PATHS.OUTPUTS_DIR_NAME),
      )
    })

    it('loads instance metadata from config', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: { http_mcp: 3000, extension: 3002 },
          instance: {
            client_id: 'user-123',
            install_id: 'install-456',
            browseros_version: '1.0.0',
            chromium_version: '120.0.0',
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.instanceClientId, 'user-123')
      assert.strictEqual(result.value.instanceInstallId, 'install-456')
      assert.strictEqual(result.value.instanceBrowserosVersion, '1.0.0')
      assert.strictEqual(result.value.instanceChromiumVersion, '120.0.0')
    })
  })

  describe('error handling (Result type)', () => {
    it('returns error for missing required ports', () => {
      const result = loadServerConfig(['bun', 'src/index.ts'])

      assert.strictEqual(result.ok, false)
      if (result.ok) return
      assert.ok(result.error.includes('serverPort'))
    })

    it('returns error for missing config file', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--config=/nonexistent/config.json',
      ])

      assert.strictEqual(result.ok, false)
      if (result.ok) return
      assert.ok(result.error.includes('Config file not found'))
    })

    it('returns error for invalid JSON in config file', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(configPath, 'this is not valid json {{{')

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, false)
      if (result.ok) return
      assert.ok(result.error.includes('Config file error'))
    })

    it('ignores invalid port types in config (Zod catches later)', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: {
            http_mcp: 'not-a-number',
            extension: 3002,
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      // Should fail Zod validation since http_mcp is invalid
      assert.strictEqual(result.ok, false)
      if (result.ok) return
      assert.ok(result.error.includes('serverPort'))
    })

    it('ignores invalid instance types (no strict validation)', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: { http_mcp: 3000, extension: 3002 },
          instance: {
            client_id: 123, // should be string
            browseros_version: true, // should be string
          },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      // Should succeed - invalid types are silently ignored
      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.instanceClientId, undefined)
      assert.strictEqual(result.value.instanceBrowserosVersion, undefined)
    })
  })

  describe('defaults', () => {
    it('uses cwd for resourcesDir and E: storage-derived state by default', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      const expectedRoot =
        process.platform === 'win32'
          ? PATHS.WINDOWS_STORAGE_ROOT
          : path.join(os.homedir(), PATHS.BROWSEROS_DIR_NAME)
      assert.strictEqual(result.value.resourcesDir, process.cwd())
      assert.strictEqual(result.value.storageRoot, expectedRoot)
      assert.strictEqual(
        result.value.executionDir,
        path.join(expectedRoot, PATHS.SERVER_STATE_DIR_NAME),
      )
      assert.strictEqual(
        result.value.outputsDir,
        path.join(expectedRoot, PATHS.OUTPUTS_DIR_NAME),
      )
    })

    it('defaults mcpAllowRemote to false', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.mcpAllowRemote, false)
    })

    it('defaults cdpPort to null', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.cdpPort, null)
    })

    it('agentPort always equals serverPort (deprecated)', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.agentPort, result.value.serverPort)
    })

    it('defaults extensionPort to null', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.extensionPort, null)
    })

    it('defaults aiSdkDevtoolsEnabled to false', () => {
      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.aiSdkDevtoolsEnabled, false)
    })
  })

  describe('AI SDK DevTools', () => {
    it('enables devtools via BROWSEROS_AI_SDK_DEVTOOLS env var', () => {
      process.env.BROWSEROS_AI_SDK_DEVTOOLS = 'true'

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        '--server-port=3000',
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.aiSdkDevtoolsEnabled, true)
    })

    it('enables devtools via config file flags.ai_sdk_devtools', () => {
      const configPath = path.join(tempDir, 'config.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          ports: { http_mcp: 3000, extension: 3002 },
          flags: { ai_sdk_devtools: true },
        }),
      )

      const result = loadServerConfig([
        'bun',
        'src/index.ts',
        `--config=${configPath}`,
      ])

      assert.strictEqual(result.ok, true)
      if (!result.ok) return
      assert.strictEqual(result.value.aiSdkDevtoolsEnabled, true)
    })
  })
})
