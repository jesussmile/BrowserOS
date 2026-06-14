import { describe, expect, it } from 'bun:test'
import {
  buildGoalAgentStrategy,
  GOAL_AGENT_STRATEGY_OPTIONS,
} from './goalAgentStrategy'

describe('buildGoalAgentStrategy', () => {
  it('keeps Auto adaptive by allowing the server to use multiple workers', () => {
    expect(buildGoalAgentStrategy('auto')).toEqual({
      mode: 'auto',
      maxWorkers: 3,
    })
  })

  it('keeps Single Agent pinned to one worker', () => {
    expect(buildGoalAgentStrategy('single')).toEqual({
      mode: 'single',
      maxWorkers: 1,
    })
  })

  it('gives explicit Parallel Workers a multi-worker budget', () => {
    expect(buildGoalAgentStrategy('parallel')).toEqual({
      mode: 'parallel',
      maxWorkers: 3,
    })
  })

  it('exposes the requested manual strategy labels', () => {
    expect(GOAL_AGENT_STRATEGY_OPTIONS.map((option) => option.label)).toEqual([
      'Auto',
      'Single Agent',
      'Parallel Workers',
    ])
  })
})
