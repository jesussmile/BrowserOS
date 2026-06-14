/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
} from 'node:path'
import type { PageInfo } from '../../browser/browser'
import { getGoalLoopOutputsDir } from '../../lib/browseros-dir'
import type {
  GoalLoopExecutionContext,
  GoalLoopExecutorResult,
  GoalLoopItemExecutor,
  GoalLoopQueueMetadata,
} from './goal-loop-service'

type BrowserDownloadResult = {
  filePath: string
  suggestedFilename: string
}

export interface GoalLoopBrowserExecutorBrowser {
  listPages(): Promise<PageInfo[]>
  getActivePage(): Promise<PageInfo | null>
  newPage(
    url: string,
    opts?: { hidden?: boolean; background?: boolean; windowId?: number },
  ): Promise<number>
  goto(page: number, url: string): Promise<void>
  waitFor(
    page: number,
    opts: { text?: string; selector?: string; timeout: number },
  ): Promise<boolean>
  snapshot(page: number): Promise<string>
  content(page: number, selector?: string): Promise<string>
  contentAsMarkdown?(
    page: number,
    opts?: {
      selector?: string
      viewportOnly?: boolean
      includeLinks?: boolean
      includeImages?: boolean
    },
  ): Promise<string>
  getPageLinks(page: number): Promise<Array<{ text: string; href: string }>>
  searchDom?(
    page: number,
    query: string,
    opts?: { limit?: number },
  ): Promise<{
    results: Array<{ backendNodeId: number; tag: string }>
    totalCount: number
  }>
  click(
    page: number,
    element: number,
    opts?: { button?: string; clickCount?: number },
  ): Promise<{ x: number; y: number } | undefined>
  clickAt(
    page: number,
    x: number,
    y: number,
    opts?: { button?: string; clickCount?: number },
  ): Promise<void>
  scroll(
    page: number,
    direction: string,
    amount: number,
    element?: number,
  ): Promise<void>
  fill(
    page: number,
    element: number,
    text: string,
    clear?: boolean,
  ): Promise<{ x: number; y: number } | undefined>
  selectOption(
    page: number,
    element: number,
    value: string,
  ): Promise<string | null>
  check(page: number, element: number): Promise<void | boolean>
  uncheck(page: number, element: number): Promise<void | boolean>
  printToPDF(
    page: number,
    opts?: { landscape?: boolean; printBackground?: boolean },
  ): Promise<{ data: string }>
  downloadViaClick(
    page: number,
    element: number,
    downloadPath: string,
  ): Promise<BrowserDownloadResult>
}

export interface GoalLoopBrowserExecutorOptions {
  browser: GoalLoopBrowserExecutorBrowser
  outputDir?: string
}

type ResolvedPage = {
  pageId: number
  url?: string
  title?: string
}

type AuthEvidence = ResolvedPage & {
  snapshot: string
  text: string
  authenticatedSessionDetected: boolean
}

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_EVIDENCE_TEXT = 4_000
const URL_PATTERN = /https?:\/\/[^\s),.;]+/i
const OURAIRPORTS_AIRPORTS_URL = 'https://ourairports.com/data/airports.csv'
const AUTHENTICATED_SESSION_PATTERN =
  /\b(?:sign out|signed in|logged in|log out|logout|my account|manage your account|account dashboard|account overview|user profile)\b/i
const AUTH_EVIDENCE_PAGE_PATTERN = /^https?:\/\//i

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readMetadata(value: unknown): GoalLoopQueueMetadata {
  const record = asRecord(value)
  const scrollDirection =
    record.scrollDirection === 'up' ||
    record.scrollDirection === 'down' ||
    record.scrollDirection === 'left' ||
    record.scrollDirection === 'right'
      ? record.scrollDirection
      : undefined
  const downloadMode =
    record.downloadMode === 'pdf' ||
    record.downloadMode === 'click' ||
    record.downloadMode === 'url'
      ? record.downloadMode
      : undefined
  const sourceKind =
    record.sourceKind === 'ourairports-countries' ||
    record.sourceKind === 'ourairports-airports' ||
    record.sourceKind === 'ourairports-country'
      ? record.sourceKind
      : undefined
  const queueExpansion =
    record.queueExpansion === 'ourairports-countries'
      ? record.queueExpansion
      : undefined
  return {
    action:
      typeof record.action === 'string'
        ? (record.action as GoalLoopQueueMetadata['action'])
        : undefined,
    risk:
      record.risk === 'low' || record.risk === 'high' ? record.risk : undefined,
    description: readString(record.description),
    approvalRequired:
      typeof record.approvalRequired === 'boolean'
        ? record.approvalRequired
        : undefined,
    approvalGranted:
      typeof record.approvalGranted === 'boolean'
        ? record.approvalGranted
        : undefined,
    approvedAt: readNumber(record.approvedAt),
    approvalReason: readString(record.approvalReason),
    requiresQueueExpansion:
      typeof record.requiresQueueExpansion === 'boolean'
        ? record.requiresQueueExpansion
        : undefined,
    expansionReason: readString(record.expansionReason),
    url: readString(record.url),
    pageId: readNumber(record.pageId),
    selector: readString(record.selector),
    element: readNumber(record.element),
    x: readNumber(record.x),
    y: readNumber(record.y),
    text: readString(record.text),
    value: readString(record.value),
    clear: typeof record.clear === 'boolean' ? record.clear : undefined,
    waitForText: readString(record.waitForText),
    waitForSelector: readString(record.waitForSelector),
    timeoutMs: readNumber(record.timeoutMs),
    scrollDirection,
    scrollAmount: readNumber(record.scrollAmount),
    downloadMode,
    outputPath: readString(record.outputPath),
    filename: readString(record.filename),
    sourceKind,
    queueExpansion,
    countryCode: readString(record.countryCode),
    countryName: readString(record.countryName),
  }
}

function extractUrl(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const match = value?.match(URL_PATTERN)
    if (match) return match[0]
  }
  return undefined
}

function truncate(value: string, max = MAX_EVIDENCE_TEXT): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function sanitizeFilePart(value: string): string {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0)
    return code < 0x20 || '<>:"/\\|?*'.includes(char) ? '-' : char
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function filenameFromContext(
  context: GoalLoopExecutionContext,
  metadata: GoalLoopQueueMetadata,
  extension: string,
): string {
  const raw =
    metadata.filename ??
    metadata.outputPath ??
    context.item.title ??
    context.item.id
  const name = basename(raw).replace(/\.[a-z0-9]+$/i, '')
  return `${sanitizeFilePart(name) || context.item.id}.${extension}`
}

function evidenceHash(buffer: Buffer): { bytes: number; sha256: string } {
  return {
    bytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function parseCsvRecords(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(text)
  if (!header?.length) return []
  return rows
    .filter((row) => row.some((field) => field.trim()))
    .map((row) =>
      Object.fromEntries(
        header.map((column, index) => [column, row[index] ?? '']),
      ),
    )
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function recordsToCsv(records: Array<Record<string, string>>): string {
  if (records.length === 0) return ''
  const headers = Object.keys(records[0])
  return [
    headers.join(','),
    ...records.map((record) =>
      headers.map((header) => csvEscape(record[header] ?? '')).join(','),
    ),
  ].join('\n')
}

function generatedQueueId(parentId: string, value: string): string {
  return `${parentId}-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`
}

export class GoalLoopBrowserExecutor implements GoalLoopItemExecutor {
  private readonly browser: GoalLoopBrowserExecutorBrowser
  private readonly outputDir: string

  constructor(options: GoalLoopBrowserExecutorOptions) {
    this.browser = options.browser
    this.outputDir = options.outputDir ?? getGoalLoopOutputsDir()
  }

  async execute(
    context: GoalLoopExecutionContext,
  ): Promise<GoalLoopExecutorResult> {
    const metadata = readMetadata(context.item.metadata)
    const action = metadata.action ?? 'read'

    if (metadata.requiresQueueExpansion) {
      const page = await this.resolvePage(context, metadata)
      return {
        status: 'blocked',
        summary: `Goal needs a durable source list before "${context.item.title}" can be considered complete.`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        error:
          metadata.expansionReason ??
          'This broad Goal Loop item needs source-list expansion before execution can continue.',
        retryable: false,
        evidence: {
          action,
          pageId: page.pageId,
          url: page.url,
          title: page.title,
          requiresQueueExpansion: true,
          expansionReason: metadata.expansionReason,
        },
      }
    }

    switch (action) {
      case 'navigate':
        return this.navigate(context, metadata)
      case 'click':
        return this.click(context, metadata)
      case 'scroll':
        return this.scroll(context, metadata)
      case 'fill':
        return this.fill(context, metadata)
      case 'select':
        return this.select(context, metadata)
      case 'check':
        return this.check(context, metadata, true)
      case 'uncheck':
        return this.check(context, metadata, false)
      case 'download':
        return this.download(context, metadata)
      case 'extract':
      case 'read':
        return this.read(context, metadata, action)
      case 'verify':
        return this.verify(context, metadata)
      case 'write':
        return {
          status: 'completed',
          summary: `Recorded local checkpoint for "${context.item.title}".`,
          evidence: {
            action,
            itemId: context.item.id,
            description: metadata.description,
          },
        }
      case 'login':
        if (
          metadata.selector !== undefined ||
          metadata.element !== undefined ||
          metadata.text !== undefined ||
          (metadata.x !== undefined && metadata.y !== undefined)
        ) {
          return this.click(context, metadata)
        }
        return this.verifyApprovedAuthStep(context, metadata, action)
      case 'credential':
        if (
          metadata.selector !== undefined ||
          metadata.element !== undefined ||
          metadata.text !== undefined
        ) {
          return this.fill(context, metadata)
        }
        return this.verifyApprovedAuthStep(context, metadata, action)
      default:
        return {
          status: 'blocked',
          summary: `Action "${action}" requires approval or a specialized executor.`,
          error: `Unsupported Goal Loop browser action: ${action}`,
          retryable: false,
        }
    }
  }

  private async verifyApprovedAuthStep(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
    action: 'login' | 'credential',
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const authEvidence = await this.findAuthenticatedSessionEvidence(page)

    if (authEvidence.authenticatedSessionDetected) {
      return {
        status: 'completed',
        summary:
          action === 'login'
            ? `Verified an existing authenticated browser session for "${context.item.title}".`
            : `Credential step satisfied by the existing authenticated browser session for "${context.item.title}".`,
        sourceUrl: authEvidence.url ?? context.item.sourceUrl,
        evidence: {
          action,
          pageId: authEvidence.pageId,
          url: authEvidence.url,
          title: authEvidence.title,
          approvalGranted: metadata.approvalGranted,
          authenticatedSessionDetected: true,
          note: 'No password was created, stored, or entered by the Goal Loop executor.',
          snapshot: truncate(authEvidence.snapshot),
        },
      }
    }

    return {
      status: 'blocked',
      summary:
        action === 'login'
          ? `Login was approved, but no existing authenticated browser session was detected for "${context.item.title}".`
          : `Credential entry was approved, but no existing authenticated browser session was detected for "${context.item.title}".`,
      sourceUrl: authEvidence.url ?? context.item.sourceUrl,
      error:
        action === 'login'
          ? 'Approved login requires an existing signed-in browser session or a dedicated high-risk form executor.'
          : 'Approved credential entry requires an existing signed-in browser session or a dedicated high-risk form executor.',
      retryable: false,
      evidence: {
        action,
        pageId: authEvidence.pageId,
        url: authEvidence.url,
        title: authEvidence.title,
        approvalGranted: metadata.approvalGranted,
        authenticatedSessionDetected: false,
        snapshot: truncate(authEvidence.snapshot),
      },
    }
  }

  private async findAuthenticatedSessionEvidence(
    preferredPage: ResolvedPage,
  ): Promise<AuthEvidence> {
    const pages = await this.browser.listPages().catch(() => [])
    const candidates = [
      ...(AUTH_EVIDENCE_PAGE_PATTERN.test(preferredPage.url ?? '')
        ? [preferredPage]
        : []),
      ...pages
        .filter((page) => page.pageId !== preferredPage.pageId)
        .filter((page) => AUTH_EVIDENCE_PAGE_PATTERN.test(page.url ?? '')),
    ].slice(0, 12)

    let fallback: AuthEvidence | undefined
    for (const page of candidates) {
      const evidence = await this.readAuthEvidence(page)
      fallback ??= evidence
      if (evidence.authenticatedSessionDetected) return evidence
    }

    return (
      fallback ?? {
        ...preferredPage,
        snapshot: '',
        text: '',
        authenticatedSessionDetected: false,
      }
    )
  }

  private async readAuthEvidence(page: ResolvedPage): Promise<AuthEvidence> {
    const [snapshot, text] = await Promise.all([
      this.browser.snapshot(page.pageId).catch(() => ''),
      this.browser.contentAsMarkdown
        ? this.browser
            .contentAsMarkdown(page.pageId, {
              includeLinks: true,
              includeImages: false,
            })
            .catch(() => '')
        : this.browser.content(page.pageId).catch(() => ''),
    ])
    const refreshed = await this.findPage(page.pageId)
    const evidenceText = `${snapshot}\n${text}`
    return {
      pageId: page.pageId,
      url: refreshed?.url ?? page.url,
      title: refreshed?.title ?? page.title,
      snapshot,
      text,
      authenticatedSessionDetected:
        AUTHENTICATED_SESSION_PATTERN.test(evidenceText),
    }
  }

  private async navigate(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const url = this.resolveUrl(context, metadata)
    if (!url) {
      return {
        status: 'blocked',
        summary: `Navigation item "${context.item.title}" has no URL.`,
        error: 'No URL supplied for navigation.',
        retryable: false,
      }
    }

    const page = await this.resolvePage(context, metadata, { url })
    if (page.url !== url) await this.browser.goto(page.pageId, url)
    const refreshed = await this.findPage(page.pageId)

    return {
      status: 'completed',
      summary: `Navigated to ${url}`,
      sourceUrl: url,
      evidence: {
        action: 'navigate',
        pageId: page.pageId,
        url: refreshed?.url ?? url,
        title: refreshed?.title,
      },
    }
  }

  private async read(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
    action: 'read' | 'extract',
  ): Promise<GoalLoopExecutorResult> {
    if (metadata.sourceKind === 'ourairports-country') {
      return this.processOurAirportsCountry(context, metadata)
    }

    const page = await this.resolvePage(context, metadata)
    const [snapshot, text, links] = await Promise.all([
      this.browser.snapshot(page.pageId),
      this.browser.contentAsMarkdown
        ? this.browser.contentAsMarkdown(page.pageId, {
            selector: metadata.selector,
            includeLinks: true,
            includeImages: false,
          })
        : this.browser.content(page.pageId, metadata.selector),
      this.browser.getPageLinks(page.pageId).catch(() => []),
    ])
    const refreshed = await this.findPage(page.pageId)

    return {
      status: 'completed',
      summary: `${action === 'extract' ? 'Extracted' : 'Read'} "${context.item.title}"`,
      sourceUrl: refreshed?.url ?? page.url ?? context.item.sourceUrl,
      evidence: {
        action,
        pageId: page.pageId,
        url: refreshed?.url ?? page.url,
        title: refreshed?.title ?? page.title,
        selector: metadata.selector,
        text: truncate(text),
        snapshot: truncate(snapshot),
        links: links.slice(0, 25),
      },
    }
  }

  private async verify(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const text = metadata.waitForText ?? metadata.text
    const selector = metadata.waitForSelector ?? metadata.selector

    if (!text && !selector) {
      const snapshot = await this.browser.snapshot(page.pageId)
      return {
        status: 'completed',
        summary: `Verified page is reachable for "${context.item.title}".`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        evidence: {
          action: 'verify',
          pageId: page.pageId,
          snapshot: truncate(snapshot),
        },
      }
    }

    const found = await this.browser.waitFor(page.pageId, {
      text,
      selector,
      timeout: metadata.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    })

    if (!found) {
      return {
        status: 'failed',
        summary: `Verification failed for "${context.item.title}".`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        error: text
          ? `Text not found: ${text}`
          : `Selector not found: ${selector}`,
        retryable: false,
        evidence: {
          action: 'verify',
          pageId: page.pageId,
          text,
          selector,
        },
      }
    }

    return {
      status: 'completed',
      summary: `Verified "${context.item.title}".`,
      sourceUrl: page.url ?? context.item.sourceUrl,
      evidence: {
        action: 'verify',
        pageId: page.pageId,
        text,
        selector,
      },
    }
  }

  private async click(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const element = await this.resolveElement(page.pageId, metadata)

    if (element !== undefined) {
      const coordinates = await this.browser.click(page.pageId, element)
      return {
        status: 'completed',
        summary: `Clicked element for "${context.item.title}".`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        evidence: {
          action: 'click',
          pageId: page.pageId,
          element,
          coordinates,
        },
      }
    }

    if (metadata.x !== undefined && metadata.y !== undefined) {
      await this.browser.clickAt(page.pageId, metadata.x, metadata.y)
      return {
        status: 'completed',
        summary: `Clicked coordinates for "${context.item.title}".`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        evidence: {
          action: 'click',
          pageId: page.pageId,
          x: metadata.x,
          y: metadata.y,
        },
      }
    }

    return {
      status: 'blocked',
      summary: `Click item "${context.item.title}" needs a selector, element ID, or coordinates.`,
      error: 'No click target metadata was supplied.',
      retryable: false,
    }
  }

  private async scroll(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const direction = metadata.scrollDirection ?? 'down'
    const amount = metadata.scrollAmount ?? 5
    await this.browser.scroll(page.pageId, direction, amount, metadata.element)

    return {
      status: 'completed',
      summary: `Scrolled ${direction} for "${context.item.title}".`,
      sourceUrl: page.url ?? context.item.sourceUrl,
      evidence: {
        action: 'scroll',
        pageId: page.pageId,
        direction,
        amount,
        element: metadata.element,
      },
    }
  }

  private async fill(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const element = await this.resolveElement(page.pageId, metadata)
    const text = metadata.value ?? metadata.text

    if (element === undefined) {
      return {
        status: 'blocked',
        summary: `Fill item "${context.item.title}" needs a selector, element ID, or text query for the target field.`,
        error: 'No fill target metadata was supplied.',
        retryable: false,
      }
    }
    if (text === undefined) {
      return {
        status: 'blocked',
        summary: `Fill item "${context.item.title}" needs text or value metadata.`,
        error: 'No fill text was supplied.',
        retryable: false,
      }
    }

    const coordinates = await this.browser.fill(
      page.pageId,
      element,
      text,
      metadata.clear ?? true,
    )

    return {
      status: 'completed',
      summary: `Filled field for "${context.item.title}".`,
      sourceUrl: page.url ?? context.item.sourceUrl,
      evidence: {
        action: 'fill',
        pageId: page.pageId,
        element,
        textLength: text.length,
        clear: metadata.clear ?? true,
        coordinates,
      },
    }
  }

  private async select(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const element = await this.resolveElement(page.pageId, metadata)
    const value = metadata.value ?? metadata.text

    if (element === undefined) {
      return {
        status: 'blocked',
        summary: `Select item "${context.item.title}" needs a selector, element ID, or text query for the dropdown.`,
        error: 'No low-risk select target metadata was supplied.',
        retryable: false,
      }
    }
    if (value === undefined) {
      return {
        status: 'blocked',
        summary: `Select item "${context.item.title}" needs option value or text metadata.`,
        error: 'No option value was supplied.',
        retryable: false,
      }
    }

    const selected = await this.browser.selectOption(
      page.pageId,
      element,
      value,
    )
    if (selected === null) {
      return {
        status: 'failed',
        summary: `Could not select "${value}" for "${context.item.title}".`,
        sourceUrl: page.url ?? context.item.sourceUrl,
        error: `Option not found: ${value}`,
        retryable: false,
        evidence: {
          action: 'select',
          pageId: page.pageId,
          element,
          value,
        },
      }
    }

    return {
      status: 'completed',
      summary: `Selected "${selected}" for "${context.item.title}".`,
      sourceUrl: page.url ?? context.item.sourceUrl,
      evidence: {
        action: 'select',
        pageId: page.pageId,
        element,
        value,
        selected,
      },
    }
  }

  private async check(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
    checked: boolean,
  ): Promise<GoalLoopExecutorResult> {
    const page = await this.resolvePage(context, metadata)
    const element = await this.resolveElement(page.pageId, metadata)

    if (element === undefined) {
      return {
        status: 'blocked',
        summary: `${checked ? 'Check' : 'Uncheck'} item "${context.item.title}" needs a selector, element ID, or text query for the checkbox.`,
        error: `No low-risk ${checked ? 'check' : 'uncheck'} target metadata was supplied.`,
        retryable: false,
      }
    }

    if (checked) {
      await this.browser.check(page.pageId, element)
    } else {
      await this.browser.uncheck(page.pageId, element)
    }

    return {
      status: 'completed',
      summary: `${checked ? 'Checked' : 'Unchecked'} low-risk control for "${context.item.title}".`,
      sourceUrl: page.url ?? context.item.sourceUrl,
      evidence: {
        action: checked ? 'check' : 'uncheck',
        pageId: page.pageId,
        element,
      },
    }
  }

  private async download(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    if (metadata.downloadMode === 'url') {
      return this.downloadUrlSource(context, metadata)
    }

    const page = await this.resolvePage(context, metadata)
    const runDir = await this.ensureRunOutputDir(context.goal.id)

    if (metadata.downloadMode === 'click' || metadata.element !== undefined) {
      if (metadata.element === undefined) {
        return {
          status: 'blocked',
          summary: `Download item "${context.item.title}" needs an element ID.`,
          error: 'Click download requires element metadata.',
          retryable: false,
        }
      }

      const tempDir = await mkdtemp(join(runDir, 'download-'))
      try {
        const result = await this.browser.downloadViaClick(
          page.pageId,
          metadata.element,
          tempDir,
        )
        const filename = sanitizeFilePart(
          metadata.filename ?? result.suggestedFilename ?? context.item.id,
        )
        const destination = this.resolveOutputPath(
          runDir,
          filename || `${context.item.id}.download`,
        )
        await mkdir(dirname(destination), { recursive: true })
        await rename(result.filePath, destination)

        return {
          status: 'completed',
          summary: `Downloaded "${filename}" locally.`,
          sourceUrl: page.url ?? context.item.sourceUrl,
          artifactPath: destination,
          evidence: {
            action: 'download',
            mode: 'click',
            pageId: page.pageId,
            element: metadata.element,
            suggestedFilename: result.suggestedFilename,
            outputPath: destination,
          },
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      }
    }

    const { data } = await this.browser.printToPDF(page.pageId)
    const pdf = Buffer.from(data, 'base64')
    const filename = filenameFromContext(context, metadata, 'pdf')
    const outputPath = this.resolveOutputPath(runDir, filename)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, pdf)
    const refreshed = await this.findPage(page.pageId)

    return {
      status: 'completed',
      summary: `Saved PDF for "${context.item.title}".`,
      sourceUrl: refreshed?.url ?? page.url ?? context.item.sourceUrl,
      artifactPath: outputPath,
      evidence: {
        action: 'download',
        mode: 'pdf',
        pageId: page.pageId,
        url: refreshed?.url ?? page.url,
        title: refreshed?.title ?? page.title,
        outputPath,
        ...evidenceHash(pdf),
      },
    }
  }

  private async downloadUrlSource(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const url = this.resolveUrl(context, metadata)
    if (!url) {
      return {
        status: 'blocked',
        summary: `Download item "${context.item.title}" has no URL.`,
        error: 'No URL supplied for URL download.',
        retryable: false,
      }
    }

    const response = await fetch(url)
    if (!response.ok) {
      return {
        status: 'failed',
        summary: `Could not download source list from ${url}.`,
        sourceUrl: url,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
        retryable: true,
      }
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    const runDir = await this.ensureRunOutputDir(context.goal.id)
    const filename = filenameFromContext(context, metadata, 'csv')
    const outputPath = this.resolveOutputPath(runDir, filename)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, bytes)

    const generatedQueueItems =
      metadata.queueExpansion === 'ourairports-countries'
        ? await this.createOurAirportsCountryQueueItems(
            context,
            metadata,
            outputPath,
            bytes.toString('utf8'),
          )
        : undefined

    return {
      status: 'completed',
      summary: generatedQueueItems?.length
        ? `Downloaded "${filename}" and generated ${generatedQueueItems.length} country queue items.`
        : `Downloaded "${filename}" locally.`,
      sourceUrl: url,
      artifactPath: outputPath,
      generatedQueueItems,
      evidence: {
        action: 'download',
        mode: 'url',
        url,
        outputPath,
        sourceKind: metadata.sourceKind,
        queueExpansion: metadata.queueExpansion,
        generatedQueueItemCount: generatedQueueItems?.length ?? 0,
        ...evidenceHash(bytes),
      },
    }
  }

  private async createOurAirportsCountryQueueItems(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
    airportsCsvPath: string,
    airportsCsv: string,
  ): Promise<NonNullable<GoalLoopExecutorResult['generatedQueueItems']>> {
    const countriesItem = context.goal.queue.find((item) => {
      const itemMetadata = readMetadata(item.metadata)
      return (
        item.status === 'completed' &&
        item.artifactPath &&
        itemMetadata.sourceKind === 'ourairports-countries'
      )
    })
    if (!countriesItem?.artifactPath) return []

    const countriesCsv = await readFile(countriesItem.artifactPath, 'utf8')
    const countries = parseCsvRecords(countriesCsv)
    const airports = parseCsvRecords(airportsCsv)
    const airportCounts = new Map<string, number>()
    for (const airport of airports) {
      const code = airport.iso_country?.trim()
      if (!code) continue
      airportCounts.set(code, (airportCounts.get(code) ?? 0) + 1)
    }

    return countries
      .map((country) => ({
        code: country.code?.trim(),
        name: country.name?.trim(),
        count: airportCounts.get(country.code?.trim() ?? '') ?? 0,
      }))
      .filter(
        (country): country is { code: string; name: string; count: number } =>
          !!country.code && !!country.name && country.count > 0,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((country) => ({
        id: generatedQueueId(context.item.id, country.code),
        title: `Process airports for ${country.name} (${country.code})`,
        maxAttempts: context.contract.retryLimit,
        sourceUrl:
          metadata.url ?? context.item.sourceUrl ?? OURAIRPORTS_AIRPORTS_URL,
        metadata: {
          action: 'extract',
          risk: 'low',
          sourceKind: 'ourairports-country',
          countryCode: country.code,
          countryName: country.name,
          url: metadata.url ?? OURAIRPORTS_AIRPORTS_URL,
          filename: `${country.code}-${country.name}-airports.csv`,
          description: `Filter ${country.count} airport record${country.count === 1 ? '' : 's'} for ${country.name} from ${basename(airportsCsvPath)}.`,
        },
      }))
  }

  private async processOurAirportsCountry(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): Promise<GoalLoopExecutorResult> {
    const countryCode = metadata.countryCode?.trim()
    const countryName = metadata.countryName?.trim() ?? countryCode
    if (!countryCode) {
      return {
        status: 'blocked',
        summary: `Country item "${context.item.title}" has no country code.`,
        error: 'Missing countryCode metadata.',
        retryable: false,
      }
    }

    const airportsSource = context.goal.queue.find((item) => {
      const itemMetadata = readMetadata(item.metadata)
      return (
        item.status === 'completed' &&
        item.artifactPath &&
        itemMetadata.sourceKind === 'ourairports-airports'
      )
    })
    if (!airportsSource?.artifactPath) {
      return {
        status: 'blocked',
        summary: `Airport source list is not available before processing ${countryName}.`,
        error: 'Missing completed OurAirports airport source artifact.',
        retryable: false,
      }
    }

    const airportsCsv = await readFile(airportsSource.artifactPath, 'utf8')
    const airports = parseCsvRecords(airportsCsv).filter(
      (airport) => airport.iso_country?.trim() === countryCode,
    )
    const runDir = await this.ensureRunOutputDir(context.goal.id)
    const filename = filenameFromContext(context, metadata, 'csv')
    const outputPath = this.resolveOutputPath(runDir, filename)
    const csv = recordsToCsv(airports)
    const bytes = Buffer.from(csv, 'utf8')
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, bytes)

    return {
      status: airports.length > 0 ? 'completed' : 'skipped',
      summary: `Processed ${airports.length} airport record${airports.length === 1 ? '' : 's'} for ${countryName}.`,
      sourceUrl:
        airportsSource.sourceUrl ?? metadata.url ?? OURAIRPORTS_AIRPORTS_URL,
      artifactPath: outputPath,
      evidence: {
        action: 'extract',
        sourceKind: 'ourairports-country',
        countryCode,
        countryName,
        airportCount: airports.length,
        outputPath,
        sourceArtifactPath: airportsSource.artifactPath,
        sample: airports.slice(0, 10).map((airport) => ({
          ident: airport.ident,
          type: airport.type,
          name: airport.name,
          municipality: airport.municipality,
          iata_code: airport.iata_code,
        })),
        ...evidenceHash(bytes),
      },
    }
  }

  private async resolvePage(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
    opts: { url?: string } = {},
  ): Promise<ResolvedPage> {
    if (metadata.pageId !== undefined) {
      const page = await this.findPage(metadata.pageId)
      return {
        pageId: metadata.pageId,
        url: page?.url,
        title: page?.title,
      }
    }

    const url = opts.url ?? this.resolveUrl(context, metadata)
    if (url) {
      const pageId = await this.browser.newPage(url)
      await this.browser.goto(pageId, url)
      const page = await this.findPage(pageId)
      return {
        pageId,
        url: page?.url ?? url,
        title: page?.title,
      }
    }

    const active = await this.browser.getActivePage()
    if (active) {
      return {
        pageId: active.pageId,
        url: active.url,
        title: active.title,
      }
    }

    const pageId = await this.browser.newPage('about:blank')
    return {
      pageId,
      url: 'about:blank',
    }
  }

  private resolveUrl(
    context: GoalLoopExecutionContext,
    metadata: GoalLoopQueueMetadata,
  ): string | undefined {
    return (
      metadata.url ??
      context.item.sourceUrl ??
      extractUrl(context.item.title, context.goal.prompt)
    )
  }

  private async resolveElement(
    pageId: number,
    metadata: GoalLoopQueueMetadata,
  ): Promise<number | undefined> {
    if (metadata.element !== undefined) return metadata.element
    if (!this.browser.searchDom) return undefined
    const query = metadata.selector ?? metadata.text
    if (!query) return undefined
    const result = await this.browser.searchDom(pageId, query, { limit: 1 })
    return result.results[0]?.backendNodeId
  }

  private async findPage(pageId: number): Promise<PageInfo | undefined> {
    const pages = await this.browser.listPages().catch(() => [])
    return pages.find((page) => page.pageId === pageId)
  }

  private async ensureRunOutputDir(goalRunId: string): Promise<string> {
    const dir = join(this.outputDir, sanitizeFilePart(goalRunId) || goalRunId)
    await mkdir(dir, { recursive: true })
    return dir
  }

  private resolveOutputPath(runDir: string, filename: string): string {
    const raw = filename.trim() || 'output'
    const relative = isAbsolute(raw) ? basename(raw) : raw
    const normalized = normalize(relative).replace(/^(\.\.[/\\])+/, '')
    const outputPath = resolve(runDir, normalized)
    const root = resolve(runDir)
    if (!outputPath.startsWith(root)) {
      return join(root, basename(outputPath))
    }
    return outputPath
  }
}
