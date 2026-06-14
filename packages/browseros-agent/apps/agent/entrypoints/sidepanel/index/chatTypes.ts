export type ChatMode = 'chat' | 'research' | 'workflow' | 'agent' | 'goal'
export type LegacyChatMode = ChatMode

export const DEFAULT_CHAT_MODE: ChatMode = 'chat'
export const LEGACY_AGENT_CHAT_MODE: ChatMode = 'agent'

export interface ChatModeDetails {
  mode: ChatMode
  label: string
  shortLabel: string
  description: string
  placeholder: string
  emptyTitle: string
  emptyDescription: string
}

export const CHAT_MODE_DETAILS: Record<ChatMode, ChatModeDetails> = {
  chat: {
    mode: 'chat',
    label: 'Chat',
    shortLabel: 'Chat',
    description: 'Read-only answers from the current page and selected tabs.',
    placeholder: 'Ask about this page...',
    emptyTitle: 'Chat with this page',
    emptyDescription: 'Ask questions about the current page or any topic',
  },
  research: {
    mode: 'research',
    label: 'Research',
    shortLabel: 'Research',
    description: 'Browse, compare sources, and summarize findings locally.',
    placeholder: 'What should I research?',
    emptyTitle: 'Research across the web',
    emptyDescription: 'Collect sources, compare claims, and summarize results',
  },
  workflow: {
    mode: 'workflow',
    label: 'Workflow',
    shortLabel: 'Workflow',
    description: 'Run repeatable browser tasks with structured execution.',
    placeholder: 'What workflow should I run?',
    emptyTitle: 'Run a repeatable workflow',
    emptyDescription: 'Use browser tools for structured tasks and form work',
  },
  agent: {
    mode: 'agent',
    label: 'Agent',
    shortLabel: 'Agent',
    description:
      'Direct full-tool agent with browser, workspace, and app access.',
    placeholder: 'What should the agent do?',
    emptyTitle: 'Agent mode',
    emptyDescription:
      'Use all available tools directly without command approvals',
  },
  goal: {
    mode: 'goal',
    label: 'Goal',
    shortLabel: 'Goal',
    description: 'Work toward a goal with full browser access.',
    placeholder: 'What goal should I complete?',
    emptyTitle: 'Goal mode',
    emptyDescription: 'Let AI browse and act without command approvals',
  },
}

export const CHAT_MODE_OPTIONS: ChatModeDetails[] = [
  CHAT_MODE_DETAILS.chat,
  CHAT_MODE_DETAILS.research,
  CHAT_MODE_DETAILS.workflow,
  CHAT_MODE_DETAILS.agent,
  CHAT_MODE_DETAILS.goal,
]

export const normalizeChatMode = (mode?: string | null): ChatMode => {
  switch (mode) {
    case 'chat':
    case 'research':
    case 'workflow':
    case 'agent':
    case 'goal':
      return mode
    default:
      return DEFAULT_CHAT_MODE
  }
}

export interface Suggestion {
  display: string
  prompt: string
  icon: string
}

export const CHAT_SUGGESTIONS: Suggestion[] = [
  {
    display: 'Summarize this page',
    prompt: 'Read the current tab and summarize it in bullet points',
    icon: '✨',
  },
  {
    display: 'What topics does this page talk about?',
    prompt:
      'Read the current tab and briefly describe what it is about in 1-2 lines',
    icon: '🔍',
  },
  {
    display: 'Extract comments from this page',
    prompt: 'Read the current tab and extract comments as bullet points',
    icon: '💬',
  },
]

export const AGENT_SUGGESTIONS: Suggestion[] = [
  {
    display: 'Research a topic across tabs',
    prompt:
      'Search the web for recent information about this topic and summarize the useful sources',
    icon: '🔍',
  },
  {
    display: 'Extract structured data',
    prompt: 'Read the current page and extract the main items as a table',
    icon: '📋',
  },
  {
    display: 'Fill a form',
    prompt:
      'Review this form, fill the needed fields, and submit it when ready',
    icon: '✅',
  },
]

export const RESEARCH_SUGGESTIONS: Suggestion[] = [
  {
    display: 'Compare recent sources',
    prompt:
      'Research this topic across multiple sources and summarize agreements, disagreements, and source links',
    icon: '🔍',
  },
  {
    display: 'Find primary references',
    prompt:
      'Find the most useful primary sources for this topic and explain what each source contributes',
    icon: '📚',
  },
  {
    display: 'Build a quick brief',
    prompt:
      'Research this topic and produce a concise brief with key facts, caveats, and next questions',
    icon: '📝',
  },
]

export const WORKFLOW_SUGGESTIONS: Suggestion[] = [
  {
    display: 'Fill safe fields',
    prompt:
      'Review this form, fill only safe fields from the information I provide, and ask before submitting',
    icon: '✅',
  },
  {
    display: 'Extract a table',
    prompt: 'Read this page and extract the main structured items into a table',
    icon: '📋',
  },
  {
    display: 'Repeat these steps',
    prompt:
      'Turn the browser steps I describe into a repeatable workflow and pause before risky actions',
    icon: '🔁',
  },
]

export const MODE_SUGGESTIONS: Record<ChatMode, Suggestion[]> = {
  chat: CHAT_SUGGESTIONS,
  research: RESEARCH_SUGGESTIONS,
  workflow: WORKFLOW_SUGGESTIONS,
  agent: AGENT_SUGGESTIONS,
  goal: AGENT_SUGGESTIONS,
}

export const getSuggestionsForMode = (mode: ChatMode): Suggestion[] =>
  MODE_SUGGESTIONS[mode]
