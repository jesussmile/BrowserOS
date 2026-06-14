import { CHATGPT_PRO_DEFAULT_MODEL_ID } from './chatgptProModels'
import type { LlmProviderConfig } from './types'

export interface AuthenticatedChatGPTProfile {
  email?: string
}

export interface AuthenticatedChatGPTProviderResult {
  providers: LlmProviderConfig[]
  defaultProviderId: string
  providersChanged: boolean
  defaultProviderChanged: boolean
}

export function shouldPreferAuthenticatedChatGPTProvider(
  currentDefaultProvider: LlmProviderConfig | undefined,
): boolean {
  if (!currentDefaultProvider) return true
  if (currentDefaultProvider.type === 'browseros') return true

  return (
    currentDefaultProvider.type === 'openai' &&
    !currentDefaultProvider.apiKey?.trim()
  )
}

export function createAuthenticatedChatGPTProvider(
  profile: AuthenticatedChatGPTProfile,
  timestamp = Date.now(),
): LlmProviderConfig {
  return {
    id: `chatgpt-pro-${timestamp}`,
    type: 'chatgpt-pro',
    name: `ChatGPT Plus/Pro${profile.email ? ` (${profile.email})` : ''}`,
    modelId: CHATGPT_PRO_DEFAULT_MODEL_ID,
    supportsImages: true,
    contextWindow: 400000,
    temperature: 0.2,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function applyAuthenticatedChatGPTProvider(
  providers: LlmProviderConfig[],
  defaultProviderId: string,
  profile: AuthenticatedChatGPTProfile,
  timestamp = Date.now(),
): AuthenticatedChatGPTProviderResult {
  let nextProviders = providers
  let chatgptProvider = providers.find(
    (provider) => provider.type === 'chatgpt-pro',
  )
  let providersChanged = false

  if (!chatgptProvider) {
    chatgptProvider = createAuthenticatedChatGPTProvider(profile, timestamp)
    nextProviders = [...providers, chatgptProvider]
    providersChanged = true
  }

  const currentDefaultProvider = nextProviders.find(
    (provider) => provider.id === defaultProviderId,
  )
  const shouldSelectChatGPT =
    defaultProviderId !== chatgptProvider.id &&
    shouldPreferAuthenticatedChatGPTProvider(currentDefaultProvider)

  return {
    providers: nextProviders,
    defaultProviderId: shouldSelectChatGPT
      ? chatgptProvider.id
      : defaultProviderId,
    providersChanged,
    defaultProviderChanged: shouldSelectChatGPT,
  }
}
