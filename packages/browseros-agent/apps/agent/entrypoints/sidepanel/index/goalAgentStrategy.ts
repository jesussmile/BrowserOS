import type { ChatAgentStrategy } from '@/lib/messaging/server/buildChatRequestBody'

export function buildGoalAgentStrategy(
  mode: ChatAgentStrategy['mode'],
): ChatAgentStrategy {
  return {
    mode,
    maxWorkers: mode === 'single' ? 1 : 3,
  }
}

export const GOAL_AGENT_STRATEGY_OPTIONS: Array<{
  mode: ChatAgentStrategy['mode']
  label: string
}> = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'single', label: 'Single Agent' },
  { mode: 'parallel', label: 'Parallel Workers' },
]
