import type { ProviderType } from './types'

export const CHATGPT_PRO_DEFAULT_MODEL_ID = 'gpt-5.5'

export const CHATGPT_PRO_MODELS = [
  { modelId: CHATGPT_PRO_DEFAULT_MODEL_ID, contextLength: 400000 },
] as const

const UNSUPPORTED_CHATGPT_ACCOUNT_MODELS = new Set<string>([
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-codex',
  'gpt-5.1',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'codex-mini',
  'codex-mini-latest',
  'gpt-5.4',
  'gpt-5.4-mini',
])

export function normalizeChatGPTProModelId(
  providerType: ProviderType,
  modelId: string | undefined,
): string {
  if (providerType !== 'chatgpt-pro') return modelId ?? ''
  if (!modelId || UNSUPPORTED_CHATGPT_ACCOUNT_MODELS.has(modelId)) {
    return CHATGPT_PRO_DEFAULT_MODEL_ID
  }
  return modelId
}
