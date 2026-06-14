import { z } from 'zod'
import { defineTool } from './framework'

const BROWSEROS_INFO = `# PannamOS — Private Local-First AI Browser

PannamOS is a private, local-first AI browser that turns plain English into supervised browser actions. This private build keeps sessions, messages, agent runs, and audit data on this PC. Open source attribution and AGPL-3.0 notices remain preserved in legal and attribution surfaces.

---

## Modes

- **Chat Mode** — Ask questions about any webpage: summarize articles, extract data, translate content, and keep tools read-only.
- **Research Mode** — Browse and compare sources, collect citations or source URLs, and avoid data-changing actions unless explicitly requested.
- **Workflow Mode** — Run repeatable browser steps, form filling, extraction, and structured output with approval pauses before risky actions.
- **Goal Mode** — Work toward a supervised goal until complete or blocked, pausing before form submissions, purchases, deletions, uploads, public messages, account changes, or other irreversible actions.

---

## Core Features

### Bring Your Own LLM
Connect your preferred AI provider or run models locally. Supported providers include Anthropic, OpenAI, OpenRouter, Gemini, Ollama, LM Studio, OpenAI-compatible endpoints, ChatGPT Plus/Pro provider auth, GitHub Copilot, Qwen Code, Azure, Bedrock, and Moonshot where configured. Configure providers in AI & Agents settings. No cloud account is required.

### Scheduled Tasks
Automate tasks on a schedule — daily, hourly, or every few minutes. Runs in a background window without interrupting your work. Use cases: morning briefings, LinkedIn automation, price monitoring. Requires PannamOS to be open.

### Filesystem Access
Grant the agent controlled access to a local folder to read files, write reports, and run shell commands. Sandboxed — cannot access parent directories. Combine web research with local file creation in a single task.

### Connect Apps (MCPs)
Link local MCP connectors so the agent can access approved tools conversationally. Custom MCP servers are supported via local SSE endpoints. Remote managed connector sync is disabled in this private build.

### MCP Server for Developer Tools
Built-in MCP server exposes 31 browser automation tools to Claude Code, Gemini CLI, OpenAI Codex CLI, and Claude Desktop. Enables agentic coding (test web apps, read console errors, fix code), data extraction from authenticated pages, and programmatic browser control.

### Chat & LLM Hub
Chat provides quick AI access across any webpage via the side panel. LLM Hub enables side-by-side comparison of up to 3 models simultaneously. Switch providers instantly with Option+L.

### Ad Blocking
Built-in ad blocking support remains part of the browser foundation where packaged with the PannamOS browser build.`

const VALID_TOPICS = [
  'overview',
  'bring-your-own-llm',
  'scheduled-tasks',
  'filesystem-access',
  'connect-apps',
  'mcp-server',
  'chat-hub',
  'ad-blocking',
] as const

const TOPIC_SECTIONS: Record<string, { start: string; end?: string }> = {
  overview: { start: '# PannamOS', end: '## Core Features' },
  'bring-your-own-llm': {
    start: '### Bring Your Own LLM',
    end: '### Scheduled Tasks',
  },
  'scheduled-tasks': {
    start: '### Scheduled Tasks',
    end: '### Filesystem Access',
  },
  'filesystem-access': {
    start: '### Filesystem Access',
    end: '### Connect Apps',
  },
  'connect-apps': {
    start: '### Connect Apps',
    end: '### MCP Server for Developer Tools',
  },
  'mcp-server': {
    start: '### MCP Server for Developer Tools',
    end: '### Chat & LLM Hub',
  },
  'chat-hub': { start: '### Chat & LLM Hub', end: '### Ad Blocking' },
  'ad-blocking': { start: '### Ad Blocking' },
}

function getTopicContent(topic: string): string {
  const section = TOPIC_SECTIONS[topic]
  if (!section) return BROWSEROS_INFO

  const startIdx = BROWSEROS_INFO.indexOf(section.start)
  if (startIdx === -1) return BROWSEROS_INFO

  const endIdx = section.end ? BROWSEROS_INFO.indexOf(section.end) : undefined

  return endIdx !== undefined && endIdx !== -1
    ? BROWSEROS_INFO.slice(startIdx, endIdx).trim()
    : BROWSEROS_INFO.slice(startIdx).trim()
}

export const browseros_info = defineTool({
  name: 'browseros_info',
  description:
    'Get local information about PannamOS private-build features and capabilities. Use when users ask "What is PannamOS?", "What can PannamOS do?", or about specific features.',
  input: z.object({
    topic: z
      .enum(VALID_TOPICS)
      .optional()
      .default('overview')
      .describe(
        'Specific topic to get info about. Use "overview" for general questions.',
      ),
  }),
  output: z.object({
    topic: z.enum(VALID_TOPICS),
    content: z.string(),
  }),
  handler: async (args, _ctx, response) => {
    const content = args.topic ? getTopicContent(args.topic) : BROWSEROS_INFO
    response.text(content)
    response.data({ topic: args.topic, content })
  },
})
