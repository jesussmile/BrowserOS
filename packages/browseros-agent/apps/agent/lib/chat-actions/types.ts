import type {
  ChatMode,
  LegacyChatMode,
} from '@/entrypoints/sidepanel/index/chatTypes'

/**
 * Base interface for all chat actions
 * @public
 */
interface BaseChatAction {
  id: string
  timestamp: number
}

/**
 * Action for AI operations on selected tabs
 * @public
 */
export interface AITabAction extends BaseChatAction {
  type: 'ai-tab'
  name: string
  description: string
  tabs: chrome.tabs.Tab[]
}

/**
 * Action for PannamOS chat/agent queries
 * @public
 */
export interface PannamOSAction extends BaseChatAction {
  type: 'browseros'
  mode: ChatMode
  message: string
  tabs?: chrome.tabs.Tab[]
}

/**
 * Union type of all chat actions
 * @public
 */
export type ChatAction = AITabAction | PannamOSAction

/**
 * Storage format for search actions passed between newtab and sidepanel
 * @public
 */
export interface SearchActionData {
  query: string
  mode: LegacyChatMode
  action?: ChatAction
}

/**
 * Helper to create an AI tab action
 * @public
 */
export const createAITabAction = (params: {
  name: string
  description: string
  tabs: chrome.tabs.Tab[]
}): AITabAction => ({
  id: crypto.randomUUID(),
  type: 'ai-tab',
  timestamp: Date.now(),
  name: params.name,
  description: params.description,
  tabs: params.tabs,
})

/**
 * Helper to create a PannamOS action
 * @public
 */
export const createPannamOSAction = (params: {
  mode: ChatMode
  message: string
  tabs?: chrome.tabs.Tab[]
}): PannamOSAction => ({
  id: crypto.randomUUID(),
  type: 'browseros',
  timestamp: Date.now(),
  mode: params.mode,
  message: params.message,
  tabs: params.tabs,
})
