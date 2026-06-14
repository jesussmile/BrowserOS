import type { GoalLoopProgress } from '@/lib/goals/goalLoopClient'

export function shouldShowGoalLoopTabMarker(
  progress?: GoalLoopProgress | null,
): boolean {
  if (!progress) return false
  const lifecycle =
    progress.lifecycleStatus ??
    (progress.status === 'completed' ? 'complete' : progress.status)
  return (
    lifecycle === 'running' ||
    lifecycle === 'resuming' ||
    lifecycle === 'compacting' ||
    progress.queueCounts.running > 0
  )
}

export function getGoalLoopCurrentSourceUrl(
  progress?: GoalLoopProgress | null,
): string | undefined {
  return progress?.currentItem?.sourceUrl
}

export function normalizeTabUrlForGoalLoop(url?: string): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}
