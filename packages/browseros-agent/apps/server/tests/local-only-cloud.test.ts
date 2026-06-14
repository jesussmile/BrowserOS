/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { EXTERNAL_URLS } from '@browseros/shared/constants/urls'

const BROWSEROS_CLOUD_DOMAINS = [
  'api.browseros.com',
  'graph.browseros.com',
  'llm.browseros.com',
  'cdn.browseros.com',
  'files.browseros.com',
]

function hasBrowserOsCloudDomain(value: string) {
  return BROWSEROS_CLOUD_DOMAINS.some((domain) => value.includes(domain))
}

function readEnvValue(filePath: string, key: string) {
  const contents = readFileSync(filePath, 'utf8')
  const prefix = `${key}=`
  const line = contents
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(prefix))

  return line?.trim().slice(prefix.length).trim() ?? ''
}

describe('private local-only cloud defaults', () => {
  it('keeps shared external URL constants away from BrowserOS cloud endpoints', () => {
    const browserOsCloudUrls = Object.values(EXTERNAL_URLS)
      .filter((value): value is string => typeof value === 'string')
      .filter(hasBrowserOsCloudDomain)

    expect(browserOsCloudUrls).toEqual([])
  })

  it('does not ship a BrowserOS cloud config endpoint in production env files', () => {
    const serverDir = resolve(import.meta.dir, '..')
    const envFiles = ['.env.production.example']
    const localProductionEnv = resolve(serverDir, '.env.production')

    if (existsSync(localProductionEnv)) {
      envFiles.push('.env.production')
    }

    for (const envFile of envFiles) {
      const value = readEnvValue(
        resolve(serverDir, envFile),
        'BROWSEROS_CONFIG_URL',
      )

      expect(hasBrowserOsCloudDomain(value)).toBe(false)
    }
  })

  it('keeps the agent BrowserOS API placeholder inert in example env', () => {
    const agentDir = resolve(import.meta.dir, '../../agent')
    const value = readEnvValue(
      resolve(agentDir, '.env.example'),
      'VITE_PUBLIC_BROWSEROS_API',
    )

    expect(value).toBe('https://browseros.invalid')
  })
})
