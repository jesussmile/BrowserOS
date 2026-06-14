/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export const LOCAL_MCP_URL_ERROR =
  'Use a local MCP URL such as http://localhost:8000/sse or http://127.0.0.1:8000/sse.'

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.startsWith('127.')
  )
}

export function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isLoopbackHostname(url.hostname)
    )
  } catch {
    return false
  }
}
