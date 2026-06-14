import { CHATGPT_PRO_DEFAULT_MODEL_ID } from './chatgptProModels'
import { getModelsDevProvider } from './models-dev'
import type { ProviderType } from './types'

/**
 * Provider template for quick setup
 * @public
 */
export interface ProviderTemplate {
  id: ProviderType
  name: string
  defaultBaseUrl: string
  defaultModelId: string
  supportsImages: boolean
  contextWindow: number
  setupGuideUrl?: string
  apiKeyUrl?: string
}

function enrichTemplate(
  providerId: ProviderType,
  overrides: {
    defaultModelId: string
    defaultBaseUrl?: string
    apiKeyUrl?: string
    setupGuideUrl?: string
  },
): ProviderTemplate {
  const provider = getModelsDevProvider(providerId)
  const model = provider?.models.find((m) => m.id === overrides.defaultModelId)

  return {
    id: providerId,
    name: provider?.name ?? providerId,
    defaultBaseUrl: overrides.defaultBaseUrl ?? provider?.api ?? '',
    defaultModelId: overrides.defaultModelId,
    supportsImages: model?.supportsImages ?? true,
    contextWindow: model?.contextWindow ?? 128000,
    ...(overrides.apiKeyUrl && { apiKeyUrl: overrides.apiKeyUrl }),
    ...(overrides.setupGuideUrl && { setupGuideUrl: overrides.setupGuideUrl }),
  }
}

/**
 * Available provider templates for quick setup
 * Private build note: runtime setup links should point to provider-owned
 * pages only. Do not send users to BrowserOS cloud/docs surfaces from here.
 * @public
 */
export const providerTemplates: ProviderTemplate[] = [
  enrichTemplate('openai', {
    defaultModelId: 'gpt-5',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  }),
  {
    id: 'chatgpt-pro',
    name: 'ChatGPT Plus/Pro',
    defaultBaseUrl: '',
    defaultModelId: CHATGPT_PRO_DEFAULT_MODEL_ID,
    supportsImages: true,
    contextWindow: 400000,
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI Compatible',
    defaultBaseUrl: '',
    defaultModelId: '',
    supportsImages: true,
    contextWindow: 128000,
  },
]

/**
 * Provider type options for select dropdowns
 * @public
 */
export const providerTypeOptions: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'chatgpt-pro', label: 'ChatGPT Plus/Pro' },
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
]

/**
 * Get provider template by type
 * @public
 */
export const getProviderTemplate = (
  type: ProviderType,
): ProviderTemplate | undefined => {
  return providerTemplates.find((t) => t.id === type)
}

/**
 * Default base URLs for each provider type
 * Auto-fills when user selects a provider type
 */
export const DEFAULT_BASE_URLS: Record<ProviderType, string> = {
  'chatgpt-pro': '',
  'github-copilot': '',
  'qwen-code': '',
  moonshot: '',
  anthropic: '',
  openai: 'https://api.openai.com/v1',
  'openai-compatible': '',
  google: '',
  openrouter: '',
  azure: '',
  ollama: '',
  lmstudio: '',
  bedrock: '',
  browseros: '',
}

/**
 * Get default base URL for a provider type
 * @public
 */
export const getDefaultBaseUrlForProviders = (type: ProviderType): string => {
  return DEFAULT_BASE_URLS[type] || ''
}
