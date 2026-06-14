/**
 * @license
 * Copyright 2025 BrowserOS
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { join } from 'node:path'

const config = {
  cdpPort: 9222,
  serverPort: 9100,
  agentPort: 9100,
  extensionPort: null,
  resourcesDir: '/tmp/pannamos-resources',
  storageRoot: '/tmp/pannamos-storage',
  executionDir: '/tmp/pannamos-execution',
  outputsDir: '/tmp/pannamos-storage/Outputs',
  mcpAllowRemote: false,
  aiSdkDevtoolsEnabled: false,
}

describe('Application.start', () => {
  const originalBrowserosDir = process.env.BROWSEROS_DIR
  const originalStorageRoot = process.env.PANNAMOS_STORAGE_ROOT
  const originalOutputsDir = process.env.PANNAMOS_OUTPUTS_DIR

  beforeEach(() => {
    if (originalBrowserosDir === undefined) {
      delete process.env.BROWSEROS_DIR
    } else {
      process.env.BROWSEROS_DIR = originalBrowserosDir
    }
    if (originalStorageRoot === undefined) {
      delete process.env.PANNAMOS_STORAGE_ROOT
    } else {
      process.env.PANNAMOS_STORAGE_ROOT = originalStorageRoot
    }
    if (originalOutputsDir === undefined) {
      delete process.env.PANNAMOS_OUTPUTS_DIR
    } else {
      process.env.PANNAMOS_OUTPUTS_DIR = originalOutputsDir
    }
  })

  afterEach(() => {
    mock.restore()
    mock.clearAllMocks()
    if (originalBrowserosDir === undefined) {
      delete process.env.BROWSEROS_DIR
    } else {
      process.env.BROWSEROS_DIR = originalBrowserosDir
    }
    if (originalStorageRoot === undefined) {
      delete process.env.PANNAMOS_STORAGE_ROOT
    } else {
      process.env.PANNAMOS_STORAGE_ROOT = originalStorageRoot
    }
    if (originalOutputsDir === undefined) {
      delete process.env.PANNAMOS_OUTPUTS_DIR
    } else {
      process.env.PANNAMOS_OUTPUTS_DIR = originalOutputsDir
    }
  })

  it('starts with the CDP backend only', async () => {
    const {
      Application,
      browserModule,
      cdpConnect,
      createHttpServer,
      loggerError,
      loggerInfo,
      loggerWarn,
    } = await setupApplicationTest()
    const app = new Application(config)

    await app.start()

    expect(cdpConnect).toHaveBeenCalledTimes(1)
    expect(createHttpServer).toHaveBeenCalledTimes(1)
    expect(createHttpServer.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        browser: expect.any(browserModule.Browser),
      }),
    )
    expect(createHttpServer.mock.calls[0]?.[0]).not.toHaveProperty('controller')
    expect(loggerInfo).toHaveBeenCalled()
    expect(loggerWarn).not.toHaveBeenCalled()
    expect(loggerError).not.toHaveBeenCalled()
  })

  it('does not start the Hermes runtime on startup', async () => {
    const {
      Application,
      configureHermesRuntime,
      createHttpServer,
      hermesService,
    } = await setupApplicationTest()
    const app = new Application(config)

    await app.start()

    expect(createHttpServer).toHaveBeenCalledTimes(1)
    expect(configureHermesRuntime).not.toHaveBeenCalled()
    expect(hermesService.executeAction).not.toHaveBeenCalled()
  })

  it('uses configured execution directory for database state', async () => {
    process.env.BROWSEROS_DIR = '/tmp/pannamos-dogfood'

    const { Application, initializeDb } = await setupApplicationTest()
    const app = new Application(config)

    await app.start()

    expect(initializeDb).toHaveBeenCalledWith({
      dbPath: join(config.executionDir, 'db', 'pannamos.sqlite'),
      resourcesDir: config.resourcesDir,
    })
  })

  it('uses a configured execution directory as local state when no PannamOS directory override is set', async () => {
    delete process.env.BROWSEROS_DIR
    const { Application, initializeDb } = await setupApplicationTest()
    const app = new Application(config)

    await app.start()

    expect(initializeDb).toHaveBeenCalledWith({
      dbPath: join(config.executionDir, 'db', 'pannamos.sqlite'),
      resourcesDir: config.resourcesDir,
    })
  })
})

async function setupApplicationTest() {
  const apiServer = await import('../src/api/server')
  const browserModule = await import('../src/browser/browser')
  const cdpModule = await import('../src/browser/backends/cdp')
  const runtimeModule = await import('../src/lib/agents/runtime')
  const browserosDir = await import('../src/lib/browseros-dir')
  const dbModule = await import('../src/lib/db')
  const identityModule = await import('../src/lib/identity')
  const loggerModule = await import('../src/lib/logger')
  const metricsModule = await import('../src/lib/metrics')
  const sentryModule = await import('../src/lib/sentry')

  const createHttpServer = spyOn(apiServer, 'createHttpServer')
  createHttpServer.mockImplementation(async () => ({}) as never)

  const cdpConnect = mock(async () => {})
  spyOn(cdpModule.CdpBackend.prototype, 'connect').mockImplementation(
    cdpConnect,
  )

  spyOn(browserosDir, 'cleanOldSessions').mockImplementation(async () => {})
  spyOn(browserosDir, 'ensureBrowserosDir').mockImplementation(async () => {})
  spyOn(browserosDir, 'writeServerConfig').mockImplementation(async () => {})
  spyOn(browserosDir, 'removeServerConfigSync').mockImplementation(() => {})

  const initializeDb = spyOn(dbModule, 'initializeDb').mockImplementation(
    () =>
      ({
        path: '/tmp/pannamos-state/db/pannamos.sqlite',
        migrationsDir: '/tmp/pannamos-resources/db/migrations',
        sqlite: { close: () => {} },
        db: {},
      }) as never,
  )
  spyOn(identityModule.identity, 'initialize').mockImplementation(() => {})
  spyOn(identityModule.identity, 'getBrowserOSId').mockImplementation(
    () => 'browseros-id',
  )

  const loggerInfo = spyOn(loggerModule.logger, 'info').mockImplementation(
    () => {},
  )
  const loggerWarn = spyOn(loggerModule.logger, 'warn').mockImplementation(
    () => {},
  )
  spyOn(loggerModule.logger, 'debug').mockImplementation(() => {})
  const loggerError = spyOn(loggerModule.logger, 'error').mockImplementation(
    () => {},
  )
  spyOn(loggerModule.logger, 'setLogFile').mockImplementation(() => {})

  spyOn(metricsModule.metrics, 'initialize').mockImplementation(() => {})
  spyOn(metricsModule.metrics, 'isEnabled').mockImplementation(() => true)
  spyOn(metricsModule.metrics, 'log').mockImplementation(() => {})

  spyOn(sentryModule.Sentry, 'setContext').mockImplementation(() => {})
  spyOn(sentryModule.Sentry, 'setUser').mockImplementation(() => {})
  spyOn(sentryModule.Sentry, 'captureException').mockImplementation(() => {})

  const hermesExecuteAction = mock(async () => {})
  const fakeHermesRuntime = { executeAction: hermesExecuteAction } as never
  const configureHermesRuntime = spyOn(
    runtimeModule,
    'configureHermesRuntime',
  ).mockImplementation(() => fakeHermesRuntime)
  spyOn(runtimeModule, 'getHermesRuntime').mockImplementation(
    () => fakeHermesRuntime,
  )
  spyOn(runtimeModule, 'configureClaudeRuntime').mockImplementation(
    () => ({}) as never,
  )
  spyOn(runtimeModule, 'configureCodexRuntime').mockImplementation(
    () => ({}) as never,
  )

  const { Application } = await import('../src/main')
  return {
    Application,
    browserModule,
    cdpConnect,
    createHttpServer,
    loggerError,
    loggerInfo,
    loggerWarn,
    initializeDb,
    configureHermesRuntime,
    hermesService: { executeAction: hermesExecuteAction },
  }
}
