import { describe, expect, it } from 'bun:test'
import { defaultProductConfig, resolveProductConfig } from './productConfig'

describe('resolveProductConfig', () => {
  it('preserves BrowserOS-compatible defaults when no private env is set', () => {
    expect(resolveProductConfig()).toEqual(defaultProductConfig)
  })

  it('can disable the public extension update URL for private unpacked builds', () => {
    const config = resolveProductConfig({
      BROWSEROS_PRIVATE_DISABLE_UPDATE_URL: 'true',
    })

    expect(config.extensionUpdateUrl).toBeNull()
  })

  it('uses reviewed private extension metadata when provided', () => {
    const config = resolveProductConfig({
      BROWSEROS_PRIVATE_EXTENSION_NAME: 'Internal Assistant',
      BROWSEROS_PRIVATE_EXTENSION_TOOLBAR_TITLE: 'Ask Internal Assistant',
      BROWSEROS_PRIVATE_EXTENSION_UPDATE_URL:
        'https://updates.example.test/extension.xml',
    })

    expect(config.extensionName).toBe('Internal Assistant')
    expect(config.extensionToolbarTitle).toBe('Ask Internal Assistant')
    expect(config.extensionUpdateUrl).toBe(
      'https://updates.example.test/extension.xml',
    )
  })

  it('ignores blank private values', () => {
    const config = resolveProductConfig({
      BROWSEROS_PRIVATE_EXTENSION_NAME: '  ',
      BROWSEROS_PRIVATE_EXTENSION_TOOLBAR_TITLE: '',
      BROWSEROS_PRIVATE_EXTENSION_UPDATE_URL: '   ',
    })

    expect(config.extensionName).toBe(defaultProductConfig.extensionName)
    expect(config.extensionToolbarTitle).toBe(
      defaultProductConfig.extensionToolbarTitle,
    )
    expect(config.extensionUpdateUrl).toBe(
      defaultProductConfig.extensionUpdateUrl,
    )
  })
})
