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
}

type ProductConfigEnv = Record<string, string | undefined>

export const defaultProductConfig: ProductConfig = {
  docsUrl: 'https://docs.browseros.com/',
  productWebHost: 'browseros.com',
  productWebUrl: 'https://browseros.com',
  productRepositoryUrl: 'https://github.com/browseros-ai/BrowserOS',
  githubOrgUrl: 'https://github.com/browseros-ai',
  privacyPolicyUrl: 'https://browseros.com/privacy',
  contributorsUrl:
    'https://github.com/browseros-ai/BrowserOS/graphs/contributors',
  discordUrl: 'https://discord.gg/browseros',
  slackUrl: 'https://dub.sh/browserOS-slack',
  productVideoUrl: 'https://youtu.be/J-lFhTP-7is',
  productRepositoryShortUrl: 'https://git.new/browseros',
  scheduledTasksHelpUrl: 'https://docs.browseros.com/features/scheduled-tasks',
  extensionName: 'Assistant',
  extensionToolbarTitle: 'Ask BrowserOS',
  extensionUpdateUrl:
    'https://cdn.browseros.com/extensions/update-manifest.xml',
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
  }
}
