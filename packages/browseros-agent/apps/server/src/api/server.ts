/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Consolidated HTTP Server
 *
 * This server combines:
 * - Agent HTTP routes (chat, klavis, provider)
 * - MCP HTTP routes (using @hono/mcp transport)
 */

import { join } from 'node:path'
import { PATHS } from '@browseros/shared/constants/paths'
import { Hono } from 'hono'
import { websocket } from 'hono/bun'
import { cors } from 'hono/cors'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { HttpAgentError } from '../agent/errors'
import { ensureHermesRuntimeReady } from '../lib/agents/runtime'
import { initializeOAuth, shutdownOAuth } from '../lib/clients/oauth'
import { getDb } from '../lib/db'
import { logger } from '../lib/logger'
import { Sentry } from '../lib/sentry'
import { createAgentRoutes } from './routes/agents'
import { createChatRoutes } from './routes/chat'
import { createCreditsRoutes } from './routes/credits'
import { createHealthRoute } from './routes/health'
import { createKlavisRoutes } from './routes/klavis'
import { createLocalRoutes } from './routes/local'
import { createMcpRoutes } from './routes/mcp'
import { createMonitoringRoutes } from './routes/monitoring'
import { createOAuthRoutes } from './routes/oauth'
import { createProviderRoutes } from './routes/provider'
import { createRefinePromptRoutes } from './routes/refine-prompt'
import { createShutdownRoute } from './routes/shutdown'
import { createStatusRoute } from './routes/status'
import { GoalLoopBrowserExecutor } from './services/goal-loop-browser-executor'
import { GoalLoopService } from './services/goal-loop-service'
import type { KlavisProxyRef } from './services/klavis/strata-proxy'
import { LocalSessionService } from './services/local-session-service'
import type { Env, HttpServerConfig } from './types'
import { defaultCorsConfig } from './utils/cors'
import { requireTrustedAppOrigin } from './utils/request-auth'

async function assertPortAvailable(port: number): Promise<void> {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const probe = net.createServer()

    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          Object.assign(new Error(`Port ${port} is already in use`), {
            code: 'EADDRINUSE',
          }),
        )
      } else {
        reject(err)
      }
    })

    probe.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      probe.close(() => resolve())
    })
  })
}

export async function createHttpServer(config: HttpServerConfig) {
  const {
    port,
    host = '0.0.0.0',
    browserosId,
    executionDir,
    outputsDir,
    resourcesDir,
    version,
    browser,
    registry,
  } = config

  const { onShutdown } = config
  const tokenManager = browserosId
    ? initializeOAuth(getDb(), browserosId)
    : null
  if (!browserosId) shutdownOAuth()

  // Cloud-backed Klavis proxy is disabled for the private local-first build.
  const klavisRef: KlavisProxyRef = { handle: null }
  const stopKlavisBackground = () => {}
  const localSessionService = new LocalSessionService()
  const goalLoopExecutor = new GoalLoopBrowserExecutor({
    browser,
    outputDir: join(outputsDir, PATHS.GOAL_LOOP_OUTPUT_DIR_NAME),
  })
  const goalLoopService = new GoalLoopService({
    service: localSessionService,
    executor: goalLoopExecutor,
  })
  let goalLoopWatchdogRunning = false
  let goalLoopWatchdog: ReturnType<typeof setInterval> | null = null
  const stopGoalLoopWatchdog = () => {
    if (!goalLoopWatchdog) return
    clearInterval(goalLoopWatchdog)
    goalLoopWatchdog = null
  }
  const startGoalLoopWatchdog = () => {
    if (goalLoopWatchdog) return
    goalLoopWatchdog = setInterval(() => {
      if (goalLoopWatchdogRunning) return
      goalLoopWatchdogRunning = true
      goalLoopService
        .resumeUnfinishedGoals({
          statuses: ['running'],
          maxItems: 1,
          resumeReason: 'watchdog',
        })
        .catch((err) =>
          logger.warn('Goal Loop watchdog failed to resume queued work', {
            error: err instanceof Error ? err.message : String(err),
          }),
        )
        .finally(() => {
          goalLoopWatchdogRunning = false
        })
    }, 60_000)
    goalLoopWatchdog.unref?.()
  }

  const monitoringRoutes = new Hono<Env>()
    .use('/*', requireTrustedAppOrigin())
    .route('/', createMonitoringRoutes())

  const agentRoutes = new Hono<Env>()
    .use('/*', requireTrustedAppOrigin())
    .route(
      '/',
      createAgentRoutes({
        browserosServerPort: port,
        resourcesDir,
        browser,
        ensureVmRuntimeReady: async (adapter) => {
          switch (adapter) {
            case 'hermes':
              await ensureHermesRuntimeReady({ resourcesDir })
          }
        },
      }),
    )

  const app = new Hono<Env>()
    .use('/*', cors(defaultCorsConfig))
    .route('/health', createHealthRoute({ browser }))
    .route(
      '/local',
      new Hono<Env>().use('/*', requireTrustedAppOrigin()).route(
        '/',
        createLocalRoutes({
          service: localSessionService,
          goalLoop: goalLoopService,
        }),
      ),
    )
    .route(
      '/shutdown',
      createShutdownRoute({
        onShutdown: () => {
          stopGoalLoopWatchdog()
          shutdownOAuth()
          stopKlavisBackground()
          klavisRef.handle?.close().catch((err) =>
            logger.warn('Failed to close Klavis proxy transport', {
              error: err instanceof Error ? err.message : String(err),
            }),
          )
          onShutdown?.()
        },
      }),
    )
    .route('/status', createStatusRoute({ browser }))
    .route('/monitoring', monitoringRoutes)
    .route('/test-provider', createProviderRoutes({ browserosId }))
    .route('/refine-prompt', createRefinePromptRoutes({ browserosId }))
    .route(
      '/oauth',
      tokenManager
        ? createOAuthRoutes({ tokenManager })
        : new Hono().all('/*', (c) =>
            c.json({ error: 'OAuth not available' }, 503),
          ),
    )
    .route('/klavis', createKlavisRoutes({ browserosId: '' }))
    .route(
      '/credits',
      createCreditsRoutes({
        browserosId,
        gatewayBaseUrl: undefined,
      }),
    )
    .route(
      '/mcp',
      createMcpRoutes({
        version,
        registry,
        browser,
        executionDir,
        defaultOutputDir: join(outputsDir, PATHS.MANUAL_OUTPUT_DIR_NAME),
        resourcesDir,
        klavisRef,
      }),
    )
    .route(
      '/chat',
      createChatRoutes({
        browser,
        registry,
        browserosId,
        klavisRef,
        defaultOutputDir: join(outputsDir, PATHS.MANUAL_OUTPUT_DIR_NAME),
        aiSdkDevtoolsEnabled: config.aiSdkDevtoolsEnabled,
      }),
    )
    .route('/agents', agentRoutes)

  // Error handler
  app.onError((err, c) => {
    const error = err as Error

    if (error instanceof HttpAgentError) {
      logger.warn('HTTP Agent Error', {
        name: error.name,
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
      return c.json(error.toJSON(), error.statusCode as ContentfulStatusCode)
    }

    Sentry.withScope((scope) => {
      scope.setTag('route', c.req.path)
      scope.setTag('method', c.req.method)
      Sentry.captureException(error)
    })

    logger.error('Unhandled Error', {
      message: error.message,
      stack: error.stack,
    })

    return c.json(
      {
        error: {
          name: 'InternalServerError',
          message: error.message || 'An unexpected error occurred',
          code: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
        },
      },
      500,
    )
  })

  await assertPortAvailable(port)

  const server = Bun.serve({
    fetch: (request, server) => app.fetch(request, { server }),
    port,
    hostname: host,
    idleTimeout: 0,
    websocket,
  })

  logger.info('Consolidated HTTP Server started', { port, host })

  goalLoopService
    .resumeUnfinishedGoals({
      statuses: ['running'],
      maxItems: 1,
      resumeReason: 'restart_resume',
    })
    .then((runs) => {
      if (runs.length > 0) {
        logger.info('Resumed unfinished Goal Loop runs after startup', {
          count: runs.length,
        })
      }
    })
    .catch((err) =>
      logger.warn('Failed to resume unfinished Goal Loop runs after startup', {
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  startGoalLoopWatchdog()

  if (config.aiSdkDevtoolsEnabled) {
    logger.info(
      'AI SDK DevTools enabled — run `npx @ai-sdk/devtools` to open the viewer',
    )
  }

  return {
    app,
    server,
    config,
  }
}
