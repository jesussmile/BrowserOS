import { describe, expect, it } from 'bun:test'
import { PANNAMOS_EXTENSION_HOST_PERMISSIONS } from './extensionManifest'

describe('PANNAMOS_EXTENSION_HOST_PERMISSIONS', () => {
  it('allows content scripts to run on ordinary public pages', () => {
    expect(PANNAMOS_EXTENSION_HOST_PERMISSIONS).toContain('*://*/*')
  })

  it('keeps local server and search suggestion access', () => {
    expect(PANNAMOS_EXTENSION_HOST_PERMISSIONS).toContain('http://127.0.0.1/*')
    expect(PANNAMOS_EXTENSION_HOST_PERMISSIONS).toContain(
      'https://suggestqueries.google.com/*',
    )
  })
})
