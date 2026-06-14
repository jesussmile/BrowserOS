import type { ChatMode } from '../../sidepanel/index/chatTypes'

export interface DemoSuggestion {
  label: string
  query: string
  mode: ChatMode
  appName?: string
}

export const APP_PROMPTS: Record<string, Omit<DemoSuggestion, 'appName'>[]> = {
  Gmail: [
    {
      label: 'Summarize my unread emails and highlight anything urgent',
      query: 'Summarize my unread emails and highlight anything urgent',
      mode: 'goal',
    },
    {
      label: 'Show the last 5 emails from my manager',
      query:
        'Show the last 5 emails from my manager and list any action items mentioned',
      mode: 'goal',
    },
  ],
  'Google Calendar': [
    {
      label: 'What meetings do I have tomorrow?',
      query:
        "What meetings do I have tomorrow? Who's attending and what's the agenda?",
      mode: 'goal',
    },
    {
      label: 'Show my schedule for this week',
      query: 'Show my schedule for this week and flag any double-bookings',
      mode: 'goal',
    },
  ],
  Notion: [
    {
      label: 'List my recently updated Notion pages',
      query: 'List my recently updated Notion pages and summarize what changed',
      mode: 'goal',
    },
    {
      label: 'Show all Notion tasks assigned to me',
      query: 'Show all Notion tasks assigned to me and their current status',
      mode: 'goal',
    },
  ],
  Slack: [
    {
      label: 'Show my unread Slack mentions',
      query: 'Show my unread Slack mentions and summarize each thread',
      mode: 'goal',
    },
    {
      label: 'Latest messages in my most active Slack channels',
      query: 'What are the latest messages in my most active Slack channels?',
      mode: 'goal',
    },
  ],
  GitHub: [
    {
      label: 'Show my open GitHub issues sorted by priority',
      query: 'Show my open GitHub issues sorted by priority',
      mode: 'goal',
    },
    {
      label: 'List my recent GitHub pull requests',
      query: 'List my recent GitHub pull requests and their review status',
      mode: 'goal',
    },
  ],
  Linear: [
    {
      label: 'What Linear tickets are assigned to me?',
      query:
        'What Linear tickets are assigned to me? Show status and any recent comments',
      mode: 'goal',
    },
    {
      label: 'Show my current Linear sprint progress',
      query:
        'Show my current Linear sprint and how many tickets are completed vs remaining',
      mode: 'goal',
    },
  ],
  Jira: [
    {
      label: 'What Jira tickets are assigned to me?',
      query: 'What Jira tickets are assigned to me? Show status and priority',
      mode: 'goal',
    },
    {
      label: 'Summarize recent comments on my open Jira issues',
      query: 'Summarize recent comments on my open Jira issues',
      mode: 'goal',
    },
  ],
  'Google Docs': [
    {
      label: 'List my recently edited Google Docs',
      query:
        'List my recently edited Google Docs and who else has been editing them',
      mode: 'goal',
    },
    {
      label: 'Show my shared Google Docs with recent comments',
      query: 'Show my shared Google Docs and summarize any recent comments',
      mode: 'goal',
    },
  ],
}

export function buildDefaultSuggestions(company?: string): DemoSuggestion[] {
  return [
    company
      ? {
          label: `Search for ${company} and summarize the latest news`,
          query: `Search for ${company} and summarize the latest news about them`,
          mode: 'research',
        }
      : {
          label: "What's the top tech news today",
          query: "What's the top tech news today? Give me a brief summary",
          mode: 'research',
        },
    {
      label: "What's the top news today",
      query:
        "What's the top news today? Give me a brief summary of the biggest stories",
      mode: 'research',
    },
    {
      label: 'Extract key details from the current page',
      query:
        'Read the current page and extract the main details into a compact table',
      mode: 'workflow',
    },
    {
      label: 'Ask a read-only question about this page',
      query: 'Read the current page and answer my question without changing it',
      mode: 'chat',
    },
  ]
}

export function buildPersonalizedSuggestions(
  connectedApps: string[],
): DemoSuggestion[] {
  const suggestions: DemoSuggestion[] = []
  const usedApps = new Set<string>()

  for (const appName of connectedApps) {
    if (usedApps.has(appName)) continue

    const prompts = APP_PROMPTS[appName]
    if (prompts?.[0]) {
      suggestions.push({ ...prompts[0], appName })
      usedApps.add(appName)
    }
  }

  return suggestions
}

export function buildCompanyPrompt(company?: string): DemoSuggestion {
  return company
    ? {
        label: `Search for ${company} and summarize the latest news`,
        query: `Search for ${company} and summarize the latest news about them`,
        mode: 'research',
      }
    : {
        label: "What's the top tech news today",
        query: "What's the top tech news today? Give me a brief summary",
        mode: 'research',
      }
}
