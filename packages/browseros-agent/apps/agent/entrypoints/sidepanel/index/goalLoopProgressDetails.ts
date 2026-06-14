import type { GoalLoopProgress } from '@/lib/goals/goalLoopClient'

function formatGoalLoopTime(timestamp?: number): string | null {
  if (!timestamp) return null

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getGoalLoopResumePrompt(
  progress: GoalLoopProgress,
): string | null {
  const prompt =
    progress.resumePrompt ?? progress.continuation?.packet?.resumePrompt
  const trimmed = prompt?.trim()
  return trimmed ? trimmed : null
}

export function getGoalLoopResumePromptPreview(
  progress: GoalLoopProgress,
): string | null {
  const prompt = getGoalLoopResumePrompt(progress)
  if (!prompt) return null

  const firstLine = prompt
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim()
  if (!firstLine) return null

  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine
}

export function getGoalLoopProgressChips(progress: GoalLoopProgress): string[] {
  const chips: string[] = []

  if (progress.workerStatus) {
    const { mode, activeWorkers, maxWorkers } = progress.workerStatus
    chips.push(`Workers ${mode} ${activeWorkers}/${maxWorkers}`)
  }

  if (progress.lockStatus?.browserMutationLocked) {
    chips.push(
      progress.lockStatus.lockedByItemId
        ? `Mutation lock ${progress.lockStatus.lockedByItemId}`
        : 'Mutation lock active',
    )
  }

  const compactedAt = formatGoalLoopTime(progress.continuation?.lastCompactedAt)
  if (compactedAt) {
    chips.push(`Compacted ${compactedAt}`)
  }

  if (getGoalLoopResumePrompt(progress)) {
    chips.push('Resume prompt ready')
  }

  return chips
}
