/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { OAUTH_MCP_SERVERS } from '../../lib/clients/klavis/oauth-mcp-servers'

const ServerNameSchema = z.object({
  serverName: z.string().min(1),
})

interface KlavisRouteDeps {
  browserosId: string
}

const CLOUD_DISABLED_ERROR =
  'Upstream managed app sync is disabled in this private local-first build. Use /local/apps or a custom local MCP server.'

export function createKlavisRoutes(deps: KlavisRouteDeps) {
  void deps

  return new Hono()
    .get('/servers', (c) => {
      return c.json({
        servers: OAUTH_MCP_SERVERS.map((server) => ({
          ...server,
          connectionMode: 'local_catalog',
        })),
        count: OAUTH_MCP_SERVERS.length,
      })
    })
    .get('/oauth-urls', (c) => {
      return c.json({ error: CLOUD_DISABLED_ERROR }, 403)
    })
    .get('/user-integrations', (c) => {
      const integrations = OAUTH_MCP_SERVERS.map((server) => ({
        name: server.name,
        is_authenticated: false,
        connection_mode: 'local_catalog',
      }))
      return c.json({
        integrations,
        count: integrations.length,
      })
    })
    .post('/servers/add', zValidator('json', ServerNameSchema), (c) => {
      const { serverName } = c.req.valid('json')

      const validServer = OAUTH_MCP_SERVERS.find((s) => s.name === serverName)
      if (!validServer) {
        return c.json({ error: `Invalid server: ${serverName}` }, 400)
      }

      return c.json({
        success: true,
        serverName,
        strataId: 'local-catalog',
        addedServers: [serverName],
        connectionMode: 'local_catalog',
      })
    })
    .post(
      '/servers/submit-api-key',
      zValidator(
        'json',
        z.object({
          serverName: z.string().min(1),
          apiKey: z.string().min(1),
          apiKeyUrl: z.string().url(),
        }),
      ),
      (c) => {
        return c.json({ error: CLOUD_DISABLED_ERROR }, 403)
      },
    )
    .delete('/servers/remove', zValidator('json', ServerNameSchema), (c) => {
      const { serverName } = c.req.valid('json')

      const validServer = OAUTH_MCP_SERVERS.find((s) => s.name === serverName)
      if (!validServer) {
        return c.json({ error: `Invalid server: ${serverName}` }, 400)
      }

      return c.json({
        success: true,
        serverName,
        connectionMode: 'local_catalog',
      })
    })
}
