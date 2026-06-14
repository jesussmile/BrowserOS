import { storage } from '@wxt-dev/storage'
import type { LegacyChatMode } from '@/entrypoints/sidepanel/index/chatTypes'
import type { ChatAction } from '@/lib/chat-actions/types'

/**
 * @public
 */
export interface SearchActionStorage {
  query: string
  mode: LegacyChatMode
  action?: ChatAction
}

/**
 * @public
 */
export const searchActionsStorage = storage.defineItem<SearchActionStorage>(
  'local:search-actions',
)
