import type { ChatMode } from '@/entrypoints/sidepanel/index/chatTypes'

const BROWSEROS_SUGGESTION_MODES: ChatMode[] = [
  'goal',
  'chat',
  'research',
  'workflow',
]

/**
 * @public
 */
export interface BrowserOSSuggestion {
  mode: ChatMode
  message: string
}

/**
 * @public
 */
export const useBrowserOSSuggestions = ({
  query,
}: {
  query: string
}): BrowserOSSuggestion[] => {
  const message = query.trim()
  if (!message) return []

  return BROWSEROS_SUGGESTION_MODES.map((mode) => ({
    mode,
    message,
  }))
}
