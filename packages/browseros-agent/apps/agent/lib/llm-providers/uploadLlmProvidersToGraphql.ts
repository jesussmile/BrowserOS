import type { LlmProviderConfig } from './types'

export async function uploadLlmProvidersToGraphql(
  providers: LlmProviderConfig[],
  userId: string,
) {
  void providers
  void userId
  // Private local-first build: provider metadata stays in local extension
  // storage and local prefs. It is never uploaded to upstream GraphQL.
}
