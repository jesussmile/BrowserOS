import { describe, expect, it } from 'bun:test'
import { defaultProductConfig, resolveProductConfig } from './productConfig'

const BROWSEROS_DOT_COM = ['browseros', 'com'].join('.')

describe('resolveProductConfig', () => {
  it('preserves private local-first defaults when no private env is set', () => {
    expect(resolveProductConfig()).toEqual(defaultProductConfig)
  })

  it('keeps default runtime links away from BrowserOS cloud hosts', () => {
    const configText = JSON.stringify(defaultProductConfig)

    expect(configText).not.toContain(`https://${BROWSEROS_DOT_COM}`)
    expect(configText).not.toContain(['docs', BROWSEROS_DOT_COM].join('.'))
    expect(configText).not.toContain(['api', BROWSEROS_DOT_COM].join('.'))
    expect(configText).not.toContain(['cdn', BROWSEROS_DOT_COM].join('.'))
    expect(defaultProductConfig.productWebHost).toBe('browseros.invalid')
  })

  it('uses PannamOS extension metadata by default', () => {
    expect(defaultProductConfig.extensionName).toBe('PannamOS Assistant')
    expect(defaultProductConfig.extensionToolbarTitle).toBe('Ask PannamOS')
    expect(defaultProductConfig.extensionManifestKey).toBeTruthy()
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
      PANNAMOS_AGENT_EXTENSION_KEY: 'private-public-key',
    })

    expect(config.extensionName).toBe('Internal Assistant')
    expect(config.extensionToolbarTitle).toBe('Ask Internal Assistant')
    expect(config.extensionUpdateUrl).toBe(
      'https://updates.example.test/extension.xml',
    )
    expect(config.extensionManifestKey).toBe('private-public-key')
  })

  it('ignores blank private values', () => {
    const config = resolveProductConfig({
      BROWSEROS_PRIVATE_EXTENSION_NAME: '  ',
      BROWSEROS_PRIVATE_EXTENSION_TOOLBAR_TITLE: '',
      BROWSEROS_PRIVATE_EXTENSION_UPDATE_URL: '   ',
      PANNAMOS_AGENT_EXTENSION_KEY: '',
    })

    expect(config.extensionName).toBe(defaultProductConfig.extensionName)
    expect(config.extensionToolbarTitle).toBe(
      defaultProductConfig.extensionToolbarTitle,
    )
    expect(config.extensionUpdateUrl).toBe(
      defaultProductConfig.extensionUpdateUrl,
    )
    expect(config.extensionManifestKey).toBe(
      defaultProductConfig.extensionManifestKey,
    )
  })
})
