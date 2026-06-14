type WorkspaceGoalRouteAction = {
  tabs?: Array<{
    url?: string | null
  }>
}

const WORKSPACE_REFERENCE_PATTERN =
  /\b(workspace|work\s*space|folder|directory|project|repo|repository|codebase|files?|readme|package\.json|source)\b/i

const WINDOWS_PATH_PATTERN = /(?:^|[\s("'`])(?:[a-zA-Z]:\\|\\\\)[^\r\n"'`]+/i

const ATTACHED_TAB_REFERENCE_PATTERN =
  /\b(?:(?:current|attached|selected|these|this)\s+(?:pages?|tabs?|websites?|sites?|urls?)|(?:on|from|in)\s+(?:the\s+)?(?:current|attached|selected)\s+(?:pages?|tabs?|websites?|sites?|urls?)|download\s+(?:pdfs?|files?)\s+from\s+(?:these|attached|selected|current))\b/i

const BROAD_SOURCE_GOAL_PATTERN =
  /\b(?:all|every|each)\b[\s\S]{0,160}\b(?:airports?|countries|world|remaining|blocked|missing)\b/i

export const referencesWorkspaceOrLocalPath = (text: string): boolean =>
  WORKSPACE_REFERENCE_PATTERN.test(text) || WINDOWS_PATH_PATTERN.test(text)

export const shouldSeedGoalLoopFromAttachedTabs = (
  text: string,
  action?: WorkspaceGoalRouteAction,
): boolean => {
  if (!action?.tabs?.some((tab) => tab.url?.startsWith('http'))) return false
  if (referencesWorkspaceOrLocalPath(text)) return false
  if (BROAD_SOURCE_GOAL_PATTERN.test(text)) return false
  return ATTACHED_TAB_REFERENCE_PATTERN.test(text)
}

export const shouldRouteWorkspaceGoalToAgentChat = (
  text: string,
  workingDir?: string | null,
  _action?: WorkspaceGoalRouteAction,
): boolean => {
  if (!workingDir?.trim()) return false

  if (referencesWorkspaceOrLocalPath(text)) {
    return true
  }

  const explicitBrowserGoal =
    /https?:\/\/|www\.|(?:\b(current|attached|these|this)\s+\b(pages?|tabs?|websites?|sites?|urls?)\b)|\b(open|visit|go\s+to|navigate|browse|click|scroll)\b|\b(search\s+(the\s+)?web)\b|\b(download|save)\b.*\b(pages?|tabs?|websites?|sites?|urls?|pdfs?)\b/i.test(
      text,
    )

  return !explicitBrowserGoal
}
