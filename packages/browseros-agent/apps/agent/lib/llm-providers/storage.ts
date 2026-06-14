import { storage } from '@wxt-dev/storage'
import { sessionStorage } from '@/lib/auth/sessionStorage'
import { getBrowserOSAdapter } from '@/lib/browseros/adapter'
import { BROWSEROS_PREFS } from '@/lib/browseros/prefs'
import { normalizeChatGPTProModelId } from './chatgptProModels'
import type { LlmProviderConfig, LlmProvidersBackup } from './types'

/** Default provider ID constant */
export const DEFAULT_PROVIDER_ID = 'openai'
const DEFAULT_PROVIDER_NAME = 'OpenAI API'

/** Storage key for LLM providers array */
export const providersStorage = storage.defineItem<LlmProviderConfig[]>(
  'local:llm-providers',
  {
    version: 2,
    migrations: {
      2: (
        providers: LlmProviderConfig[] | null,
      ): LlmProviderConfig[] | null => {
        if (!providers) return providers
        return normalizeProvidersForPrivateBuild(providers)
      },
    },
  },
)

/** Backup providers to local browser prefs (write-only, best-effort). */
async function backupToPannamOSPrefs(
  backup: LlmProvidersBackup,
): Promise<void> {
  try {
    const adapter = getBrowserOSAdapter()
    await adapter.setPref(BROWSEROS_PREFS.PROVIDERS, JSON.stringify(backup))
  } catch {
    // Local browser API not available - ignore
  }
}

/**
 * Setup one-way sync of LLM providers to local browser prefs.
 * @public
 */
export function setupLlmProvidersBackupToPannamOS(): () => void {
  const unsubscribe = providersStorage.watch(async (providers) => {
    if (providers) {
      const defaultProviderId = await defaultProviderIdStorage.getValue()
      await backupToPannamOSPrefs({ defaultProviderId, providers })
    }
  })
  return unsubscribe
}

export async function syncLlmProviders(): Promise<void> {
  // Private fork default: provider configuration stays local. Model requests
  // still go to the configured provider when the user sends a prompt.
  await sessionStorage.getValue()
}

/** Private local-first build keeps provider metadata off upstream cloud. */
export function setupLlmProvidersSyncToBackend(): () => void {
  syncLlmProviders().catch(() => {})

  const unsubscribe = providersStorage.watch(async () => {
    try {
      await syncLlmProviders()
    } catch {
      // Sync failed silently - will retry on next storage change
    }
  })
  return unsubscribe
}

/** Load providers from storage */
export async function loadProviders(): Promise<LlmProviderConfig[]> {
  const providers = (await providersStorage.getValue()) || []
  const normalizedProviders = normalizeProvidersForPrivateBuild(providers)

  // Keep storage consistent so every consumer sees the same provider name.
  if (
    normalizedProviders.some((provider, index) => provider !== providers[index])
  ) {
    await providersStorage.setValue(normalizedProviders)
  }

  return normalizedProviders
}

/** Creates the default private BYOK provider configuration. */
export function createDefaultPannamOSProvider(): LlmProviderConfig {
  const timestamp = Date.now()
  return {
    id: DEFAULT_PROVIDER_ID,
    type: 'openai',
    name: DEFAULT_PROVIDER_NAME,
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5',
    supportsImages: true,
    contextWindow: 128000,
    temperature: 0.2,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/** Creates the default providers configuration. Only call when storage is empty. */
export function createDefaultProvidersConfig(): LlmProviderConfig[] {
  return [createDefaultPannamOSProvider()]
}

const privateBuildBlockedProviderTypes = new Set<LlmProviderConfig['type']>([
  'browseros',
])

/** Removes BrowserOS cloud defaults from private local-first builds. */
export function normalizeProvidersForPrivateBuild(
  providers: LlmProviderConfig[],
): LlmProviderConfig[] {
  const normalized = providers
    .filter((provider) => !privateBuildBlockedProviderTypes.has(provider.type))
    .map((provider) => {
      const modelId = normalizeChatGPTProModelId(
        provider.type,
        provider.modelId,
      )
      return modelId === provider.modelId ? provider : { ...provider, modelId }
    })
  return normalized.length > 0 ? normalized : createDefaultProvidersConfig()
}

/** Storage key for the default provider ID */
export const defaultProviderIdStorage = storage.defineItem<string>(
  'local:default-provider-id',
  {
    fallback: DEFAULT_PROVIDER_ID,
  },
)
