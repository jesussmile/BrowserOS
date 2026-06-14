/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, it } from 'bun:test'
import assert from 'node:assert'
import { createKlavisRoutes } from '../../../src/api/routes/klavis'

describe('createKlavisRoutes', () => {
  it('serves compatibility app catalog data without upstream cloud auth', async () => {
    const route = createKlavisRoutes({ browserosId: 'user-123' })
    const integrationsResponse = await route.request('/user-integrations')
    const integrations = await integrationsResponse.json()
    assert.strictEqual(integrationsResponse.status, 200)
    assert.ok(integrations.count > 0)
    assert.deepStrictEqual(integrations.integrations[0], {
      name: integrations.integrations[0].name,
      is_authenticated: false,
      connection_mode: 'local_catalog',
    })

    const response = await route.request('/servers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serverName: 'Google Docs' }),
    })
    const body = await response.json()

    assert.strictEqual(response.status, 200)
    assert.deepStrictEqual(body, {
      success: true,
      serverName: 'Google Docs',
      strataId: 'local-catalog',
      addedServers: ['Google Docs'],
      connectionMode: 'local_catalog',
    })
  })

  it('rejects BrowserOS cloud-managed OAuth and API-key routes', async () => {
    const route = createKlavisRoutes({ browserosId: 'user-123' })

    const oauthResponse = await route.request('/oauth-urls')
    assert.strictEqual(oauthResponse.status, 403)
    assert.match((await oauthResponse.json()).error, /disabled/)

    const apiKeyResponse = await route.request('/servers/submit-api-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serverName: 'Gmail',
        apiKey: 'not-a-real-key',
        apiKeyUrl: 'https://example.test/setup?instance_id=test',
      }),
    })
    assert.strictEqual(apiKeyResponse.status, 403)
    assert.match((await apiKeyResponse.json()).error, /disabled/)
  })
})
