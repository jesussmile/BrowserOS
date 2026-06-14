export function canSendInitialNewTabMessage({
  query,
  isLoading,
  hasSelectedProvider,
}: {
  query: string | null
  isLoading: boolean
  hasSelectedProvider: boolean
}): boolean {
  return Boolean(query?.trim()) && !isLoading && hasSelectedProvider
}
