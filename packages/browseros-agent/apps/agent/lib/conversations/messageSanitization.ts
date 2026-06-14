import type { UIMessage } from 'ai'

const MAX_TEXT_PART_CHARS = 65_536
const MAX_REASONING_PART_CHARS = 8_192
const MAX_TOOL_INPUT_CHARS = 2_048
const MAX_TOOL_ERROR_CHARS = 2_048
const MAX_NUDGE_OUTPUT_CHARS = 8_192
const MAX_MESSAGES = 60

const NUDGE_TOOLS = new Set(['suggest_schedule', 'suggest_app_connection'])
const OMITTED_PROVIDER_METADATA_FIELDS = new Set([
  'providerMetadata',
  'callProviderMetadata',
  'experimental_providerMetadata',
])

function truncateString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}... [truncated ${value.length - maxChars} chars]`
}

function getToolName(part: { type?: unknown; toolName?: unknown }): string {
  if (typeof part.toolName === 'string') return part.toolName
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice(5)
    : ''
}

function isToolPart(part: { type?: unknown }): boolean {
  return (
    part.type === 'dynamic-tool' ||
    (typeof part.type === 'string' && part.type.startsWith('tool-'))
  )
}

function summarizeJsonValue(value: unknown, maxChars: number): unknown {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') return truncateString(value, maxChars)
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value
  }

  try {
    const json = JSON.stringify(value)
    if (json.length <= maxChars) return value
    return {
      _pannamosOmitted: true,
      sizeChars: json.length,
      preview: truncateString(json, Math.min(maxChars, 512)),
    }
  } catch {
    return {
      _pannamosOmitted: true,
      preview: '[unserializable tool payload omitted]',
    }
  }
}

function omittedToolOutput(output: unknown): unknown {
  if (
    output &&
    typeof output === 'object' &&
    '_pannamosOmitted' in output &&
    (output as { _pannamosOmitted?: unknown })._pannamosOmitted
  ) {
    return output
  }

  const isError =
    output &&
    typeof output === 'object' &&
    'isError' in output &&
    Boolean((output as { isError?: unknown }).isError)

  return {
    _pannamosOmitted: true,
    isError,
    content: [
      {
        type: 'text',
        text: '[Tool output omitted from sidepanel history to reduce memory usage.]',
      },
    ],
  }
}

function sanitizeToolPart(part: UIMessage['parts'][number]) {
  const raw = part as Record<string, unknown>
  const toolName = getToolName(raw)
  let changed = false
  const next: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (OMITTED_PROVIDER_METADATA_FIELDS.has(key)) {
      changed = true
      continue
    }
    next[key] = value
  }

  if ('input' in next) {
    const sanitizedInput = summarizeJsonValue(next.input, MAX_TOOL_INPUT_CHARS)
    if (sanitizedInput !== next.input) {
      next.input = sanitizedInput
      changed = true
    }
  }

  if ('output' in next) {
    const sanitizedOutput = NUDGE_TOOLS.has(toolName)
      ? summarizeJsonValue(next.output, MAX_NUDGE_OUTPUT_CHARS)
      : omittedToolOutput(next.output)
    if (sanitizedOutput !== next.output) {
      next.output = sanitizedOutput
      changed = true
    }
  }

  if (typeof next.errorText === 'string') {
    const errorText = truncateString(next.errorText, MAX_TOOL_ERROR_CHARS)
    if (errorText !== next.errorText) {
      next.errorText = errorText
      changed = true
    }
  }

  return changed ? (next as UIMessage['parts'][number]) : part
}

function sanitizePart(part: UIMessage['parts'][number]) {
  const raw = part as Record<string, unknown>
  const hasProviderMetadata = Object.keys(raw).some((key) =>
    OMITTED_PROVIDER_METADATA_FIELDS.has(key),
  )
  const withoutProviderMetadata = hasProviderMetadata
    ? (Object.fromEntries(
        Object.entries(raw).filter(
          ([key]) => !OMITTED_PROVIDER_METADATA_FIELDS.has(key),
        ),
      ) as UIMessage['parts'][number])
    : part

  if (part.type === 'text') {
    const text = truncateString(part.text, MAX_TEXT_PART_CHARS)
    return text === part.text && !hasProviderMetadata
      ? part
      : { ...(withoutProviderMetadata as typeof part), text }
  }

  if (part.type === 'reasoning') {
    const text = truncateString(part.text, MAX_REASONING_PART_CHARS)
    return text === part.text && !hasProviderMetadata
      ? part
      : { ...(withoutProviderMetadata as typeof part), text }
  }

  if (isToolPart(withoutProviderMetadata)) {
    return sanitizeToolPart(withoutProviderMetadata)
  }

  return withoutProviderMetadata
}

function sanitizeMessage(message: UIMessage): UIMessage {
  const raw = message as unknown as Record<string, unknown>
  const next: Record<string, unknown> = {}
  let changed = false

  for (const [key, value] of Object.entries(raw)) {
    if (OMITTED_PROVIDER_METADATA_FIELDS.has(key)) {
      changed = true
      continue
    }
    next[key] = value
  }

  if (!message.parts?.length) {
    return changed ? (next as unknown as UIMessage) : message
  }

  const parts = message.parts.map(sanitizePart)
  if (parts.some((part, index) => part !== message.parts[index])) {
    changed = true
    next.parts = parts
  }

  return changed ? (next as unknown as UIMessage) : message
}

export function sanitizeConversationMessages(
  messages: UIMessage[],
): UIMessage[] {
  const recentMessages =
    messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages
  let changed = recentMessages !== messages

  const sanitized = recentMessages.map((message) => {
    const next = sanitizeMessage(message)
    if (next !== message) changed = true
    return next
  })

  return changed ? sanitized : messages
}

export function sanitizeToolPayloadForUi(value: unknown): unknown {
  return summarizeJsonValue(value, MAX_TOOL_INPUT_CHARS)
}
