export interface ProductConfig {
  docsUrl: string
  productWebHost: string
  productWebUrl: string
  productRepositoryUrl: string
  githubOrgUrl: string
  privacyPolicyUrl: string
  contributorsUrl: string
  discordUrl: string
  slackUrl: string
  productVideoUrl: string
  productRepositoryShortUrl: string
  scheduledTasksHelpUrl: string
  extensionName: string
  extensionToolbarTitle: string
  extensionUpdateUrl: string | null
  extensionManifestKey: string | null
}

type ProductConfigEnv = Record<string, string | undefined>

export const defaultProductConfig: ProductConfig = {
  docsUrl: 'app.html#/onboarding/features',
  productWebHost: 'browseros.invalid',
  productWebUrl: 'app.html#/home',
  productRepositoryUrl: 'https://github.com/browseros-ai/BrowserOS',
  githubOrgUrl: 'https://github.com/browseros-ai',
  privacyPolicyUrl: 'app.html#/settings/ai',
  contributorsUrl:
    'https://github.com/browseros-ai/BrowserOS/graphs/contributors',
  discordUrl: 'app.html#/onboarding/features',
  slackUrl: 'app.html#/onboarding/features',
  productVideoUrl: 'https://youtu.be/J-lFhTP-7is',
  productRepositoryShortUrl: 'https://git.new/browseros',
  scheduledTasksHelpUrl: 'app.html#/scheduled',
  extensionName: 'PannamOS Assistant',
  extensionToolbarTitle: 'Ask PannamOS',
  extensionUpdateUrl: null,
  extensionManifestKey:
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvBDAaDRvv61NpBeLR8etBRw82lv9VJO3sz/mA26gDzWKtVuzW4DXCl8Zfj5oWmoXLTfv3aiTigUXo/LHOoGpSucEVroMmAc7cgu2KuQ1fZPpMvYa0npD/m4h89360q8Oz0oKKaZGS905IJ04M2IkF4CuU3YEHFJBWb+cUyK9H8YVugelYbPD0IVs63T1SkGbh/t/Tfb2DpkinduSO8+x26sKydm30SRt+iZ2+7Nolcdum3LExInUiX2Pgb65Jb+mVw8NqyTVJyCEp8uq0cSHomWFQirSJ80tsDhISp4btwaRKHrXqovQx9XHQv4hCd+3LuB830eUEVMUNuCO+OyPxQIDAQAB',
}

function optionalEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function envFlagEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(value?.trim().toLowerCase() ?? '')
}

export function resolveProductConfig(
  env: ProductConfigEnv = {},
): ProductConfig {
  const extensionUpdateUrl = envFlagEnabled(
    env.BROWSEROS_PRIVATE_DISABLE_UPDATE_URL,
  )
    ? null
    : (optionalEnvValue(env.BROWSEROS_PRIVATE_EXTENSION_UPDATE_URL) ??
      defaultProductConfig.extensionUpdateUrl)

  return {
    ...defaultProductConfig,
    extensionName:
      optionalEnvValue(env.BROWSEROS_PRIVATE_EXTENSION_NAME) ??
      defaultProductConfig.extensionName,
    extensionToolbarTitle:
      optionalEnvValue(env.BROWSEROS_PRIVATE_EXTENSION_TOOLBAR_TITLE) ??
      defaultProductConfig.extensionToolbarTitle,
    extensionUpdateUrl,
    extensionManifestKey:
      optionalEnvValue(env.PANNAMOS_AGENT_EXTENSION_KEY) ??
      defaultProductConfig.extensionManifestKey,
  }
}
