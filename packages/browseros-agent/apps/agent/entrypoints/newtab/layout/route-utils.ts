const HIDE_FOCUS_GRID_PATHS = new Set([
  '/home',
  '/home/chat',
  '/home/chat/history',
])

export function isAgentCommandPath(pathname: string): boolean {
  return pathname === '/home' || isAgentConversationPath(pathname)
}

export function isAgentConversationPath(pathname: string): boolean {
  return pathname.startsWith('/home/agents/')
}

export function shouldHideFocusGrid(pathname: string): boolean {
  return (
    HIDE_FOCUS_GRID_PATHS.has(pathname) || isAgentConversationPath(pathname)
  )
}

export function shouldUseChatSession(
  pathname: string,
  useChatSessionOnHome = false,
): boolean {
  return (
    pathname === '/home/chat' ||
    pathname === '/home/chat/history' ||
    (useChatSessionOnHome && pathname === '/home')
  )
}
