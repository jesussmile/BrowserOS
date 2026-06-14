import type { TypedDocumentString } from '@/generated/graphql/graphql'

export async function execute<TResult, TVariables = undefined>(
  _query: TypedDocumentString<TResult, TVariables>,
  _variables?: TVariables,
): Promise<TResult> {
  throw new Error(
    'Upstream GraphQL sync is disabled in this private local-first PannamOS build.',
  )
}
