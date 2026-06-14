import type { BrowserContext } from '@browseros/shared/schemas/browser-context'

export type FormattableAttachment =
  | {
      kind: 'file'
      mediaType: string
      name?: string
      text: string
    }
  | {
      kind: 'image'
      mediaType: string
      name?: string
      dataUrl: string
    }

export function formatBrowserContext(browserContext?: BrowserContext): string {
  if (!browserContext?.activeTab && !browserContext?.selectedTabs?.length) {
    return ''
  }

  const formatTab = (tab: {
    id: number
    url?: string
    title?: string
    pageId?: number
  }) => {
    let line = `Tab ${tab.id}`
    if (tab.pageId !== undefined) line += ` (Page ID: ${tab.pageId})`
    if (tab.title) line += ` - "${tab.title}"`
    if (tab.url) line += ` (${tab.url})`
    return line
  }

  const lines: string[] = ['## Browser Context']

  if (browserContext.windowId !== undefined) {
    lines.push(`**Window ID:** ${browserContext.windowId}`)
  }

  if (browserContext.activeTab) {
    lines.push(`**Active Tab:** ${formatTab(browserContext.activeTab)}`)
  }

  if (browserContext.selectedTabs?.length) {
    lines.push(`**Selected Tabs (${browserContext.selectedTabs.length}):**`)
    browserContext.selectedTabs.forEach((tab, i) => {
      lines.push(`  ${i + 1}. ${formatTab(tab)}`)
    })
  }

  return `${lines.join('\n')}\n\n---\n\n`
}

/** Strip XML-like tags that match our prompt delimiters to prevent injection. */
function sanitizeForPrompt(s: string): string {
  return s.replace(
    /<\/?(?:selected_text|attachment|attachments|USER_QUERY|page_context|AGENT_PROMPT|soul|security|workspace)[^>]*>/gi,
    '',
  )
}

function formatAttachments(attachments?: FormattableAttachment[]): string {
  const files = attachments?.filter((attachment) => attachment.kind === 'file')
  if (!files?.length) return ''

  const blocks = files.map((attachment, index) => {
    const name = sanitizeForPrompt(attachment.name ?? `attachment-${index + 1}`)
    const mediaType = sanitizeForPrompt(attachment.mediaType)
    const text = sanitizeForPrompt(attachment.text)
    return `<attachment name="${name.replace(/"/g, "'")}" mediaType="${mediaType.replace(/"/g, "'")}">\n${text}\n</attachment>`
  })

  return `<attachments>\n${blocks.join('\n\n')}\n</attachments>\n\n`
}

export function formatUserMessage(
  message: string,
  browserContext?: BrowserContext,
  selectedText?: string,
  selectedTextSource?: { url: string; title: string },
  attachments?: FormattableAttachment[],
): string {
  const contextPrefix = formatBrowserContext(browserContext)

  let selectedTextBlock = ''
  if (selectedText) {
    const sanitizedText = sanitizeForPrompt(selectedText)
    const title = selectedTextSource?.title
      ? sanitizeForPrompt(selectedTextSource.title).replace(/"/g, "'")
      : ''
    const url = selectedTextSource?.url
      ? sanitizeForPrompt(selectedTextSource.url)
      : ''
    const source = title ? ` (from "${title}"${url ? ` — ${url}` : ''})` : ''
    selectedTextBlock = `<selected_text${source}>\n${sanitizedText}\n</selected_text>\n\n`
  }

  const attachmentBlock = formatAttachments(attachments)

  return `${contextPrefix}${selectedTextBlock}${attachmentBlock}<USER_QUERY>\n${message}\n</USER_QUERY>`
}
