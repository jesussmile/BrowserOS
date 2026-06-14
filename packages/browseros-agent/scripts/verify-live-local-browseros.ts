import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const cdpPort = Number(process.env.BROWSEROS_CDP_PORT ?? 9005)
const serverPort = Number(process.env.BROWSEROS_SERVER_PORT ?? 9105)
const liveBrowserosDir = resolveLiveBrowserosDir()

const browserOsCloudPattern =
  /api\.browseros\.com|graph\.browseros\.com|llm\.browseros\.com|cdn\.browseros\.com|files\.browseros\.com/i

const requiredModeUi = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Read-only answers from the current page and selected tabs.',
    placeholder: 'Ask about this page...',
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Browse, compare sources, and summarize findings locally.',
    placeholder: 'What should I research?',
  },
  {
    id: 'workflow',
    label: 'Workflow',
    description: 'Run repeatable browser tasks with approval for risky steps.',
    placeholder: 'What workflow should I run?',
  },
  {
    id: 'goal',
    label: 'Goal',
    description: 'Work toward a supervised goal until complete or blocked.',
    placeholder: 'What goal should I complete?',
  },
]
const requiredRuntimeSkills = [
  'approval-gates',
  'chat',
  'connected-apps',
  'extraction',
  'forms',
  'goal',
  'memory',
  'pannamos',
  'research',
  'soul',
  'tab-workflows',
  'workflow',
]
const requiredRoles = [
  'chief-of-staff',
  'research-analyst',
  'workflow-operator',
  'qa-browser-tester',
  'data-extraction-analyst',
  'knowledge-manager',
]

const liveVerifierLocalMcpServer = {
  id: 'live-local-verifier-mcp',
  displayName: 'Live Local Connector',
  type: 'managed',
  managedServerName: 'Gmail',
  connectionMode: 'local_catalog',
  config: {
    url: 'http://127.0.0.1:7777/sse',
    description: 'Live verifier loopback MCP connector',
    tools: [{ name: 'live_local_search' }],
    toolCount: 1,
    lastCheckedAt: 0,
    lastCheckStatus: 'ok',
  },
}

const liveVerifierRemoteMcpServer = {
  id: 'live-remote-verifier-mcp',
  displayName: 'Live Remote Connector',
  type: 'custom',
  config: {
    url: 'https://mcp.example.com/sse',
    description: 'Remote connector that must not be sent',
  },
}

const liveVerifierProvider = {
  id: 'live-local-provider',
  type: 'openai-compatible',
  name: 'Live Local Provider',
  baseUrl: 'http://127.0.0.1:11434/v1',
  modelId: 'local-live-model',
  supportsImages: false,
  contextWindow: 32_000,
  temperature: 0.2,
  createdAt: 0,
  updatedAt: 0,
}

interface CdpTarget {
  id: string
  type: string
  title: string
  url: string
  webSocketDebuggerUrl?: string
}

interface CapturedChatRequest {
  url: string
  method: string
  postData?: string
}

interface TempLocalAgent {
  id: string
  name: string
}

class CdpConnection {
  private nextId = 1
  private pending = new Map<number, (message: unknown) => void>()

  private constructor(private readonly socket: WebSocket) {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string)
      const id = typeof message.id === 'number' ? message.id : null
      if (id === null) return

      const resolve = this.pending.get(id)
      if (!resolve) return

      this.pending.delete(id)
      resolve(message)
    }
  }

  static connect(url: string) {
    const socket = new WebSocket(url)
    return new Promise<CdpConnection>((resolve, reject) => {
      socket.onopen = () => resolve(new CdpConnection(socket))
      socket.onerror = () => reject(new Error(`Failed to connect CDP: ${url}`))
    })
  }

  send<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise<T>((resolve) => {
      this.pending.set(id, (message) => resolve(message as T))
    })
  }

  close() {
    this.socket.close()
  }
}

class PageCdpConnection {
  private nextId = 1
  private pending = new Map<number, (message: unknown) => void>()
  readonly requestUrls: string[] = []
  readonly capturedChatRequests: CapturedChatRequest[] = []

  private constructor(private readonly socket: WebSocket) {
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string)
      if (message.method === 'Network.requestWillBeSent') {
        const url = message.params?.request?.url
        if (typeof url === 'string') this.requestUrls.push(url)
      }
      if (message.method === 'Fetch.requestPaused') {
        void this.handlePausedRequest(message.params)
      }

      const id = typeof message.id === 'number' ? message.id : null
      if (id === null) return

      const resolve = this.pending.get(id)
      if (!resolve) return

      this.pending.delete(id)
      resolve(message)
    }
  }

  static connect(url: string) {
    const socket = new WebSocket(url)
    return new Promise<PageCdpConnection>((resolve, reject) => {
      socket.onopen = () => resolve(new PageCdpConnection(socket))
      socket.onerror = () => reject(new Error(`Failed to connect CDP: ${url}`))
    })
  }

  send<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise<T>((resolve) => {
      this.pending.set(id, (message) => resolve(message as T))
    })
  }

  close() {
    this.socket.close()
  }

  private async handlePausedRequest(params: unknown) {
    if (!isObject(params)) return
    const requestId = params.requestId
    const request = params.request
    if (typeof requestId !== 'string' || !isObject(request)) return

    const url = typeof request.url === 'string' ? request.url : ''
    const method = typeof request.method === 'string' ? request.method : ''
    const postData =
      typeof request.postData === 'string' ? request.postData : undefined

    try {
      if (isChatRequestUrl(url) && method === 'POST') {
        this.capturedChatRequests.push({ url, method, postData })
        await this.send('Fetch.failRequest', {
          requestId,
          errorReason: 'Aborted',
        })
        return
      }

      await this.send('Fetch.continueRequest', { requestId })
    } catch {
      // The page may navigate away while an intercepted request is being handled.
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function runtimeValue<T>(response: unknown, label: string): T {
  if (!isObject(response)) {
    throw new Error(`${label} returned a non-object CDP response`)
  }

  if (isObject(response.error)) {
    throw new Error(`${label} failed: ${JSON.stringify(response.error)}`)
  }

  const resultEnvelope = response.result
  if (!isObject(resultEnvelope)) {
    throw new Error(`${label} returned no result: ${JSON.stringify(response)}`)
  }

  if (isObject(resultEnvelope.exceptionDetails)) {
    throw new Error(
      `${label} threw in the page: ${JSON.stringify(
        resultEnvelope.exceptionDetails,
      )}`,
    )
  }

  const result = resultEnvelope.result
  if (!isObject(result) || !('value' in result)) {
    throw new Error(`${label} returned no value: ${JSON.stringify(response)}`)
  }

  return result.value as T
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCapturedChatRequest(
  page: PageCdpConnection,
  count: number,
  label: string,
) {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    if (page.capturedChatRequests.length >= count) return
    await sleep(100)
  }

  throw new Error(`Timed out waiting for local chat request for ${label}`)
}

async function waitForRequestUrl(
  page: PageCdpConnection,
  startIndex: number,
  predicate: (url: string) => boolean,
  label: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const matched = page.requestUrls.slice(startIndex).find(predicate)
    if (matched) return matched
    await sleep(100)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function readPageBodyText(page: PageCdpConnection, label: string) {
  const result = runtimeValue<string>(
    await page.send('Runtime.evaluate', {
      expression: `document.body?.innerText ?? ''`,
      returnByValue: true,
    }),
    `Read page body for ${label}`,
  )
  return result
}

async function waitForPageText(
  page: PageCdpConnection,
  expectedTexts: string[],
  label: string,
  timeoutMs = 8000,
) {
  const deadline = Date.now() + timeoutMs
  let bodyText = ''

  while (Date.now() < deadline) {
    bodyText = await readPageBodyText(page, label)
    if (expectedTexts.every((text) => bodyText.includes(text))) {
      return bodyText
    }
    await sleep(150)
  }

  const missingTexts = expectedTexts.filter((text) => !bodyText.includes(text))
  throw new Error(
    `Timed out waiting for ${label}; missing ${missingTexts.join(', ')}`,
  )
}

async function verifyVisiblePannamosBranding(
  page: PageCdpConnection,
  extensionId: string,
) {
  const routes = [
    { label: 'AI settings', path: 'app.html#/settings/ai' },
    { label: 'Connect apps', path: 'app.html#/connect-apps' },
    { label: 'MCP settings', path: 'app.html#/settings/mcp' },
    { label: 'Scheduled tasks', path: 'app.html#/scheduled' },
    { label: 'Customize settings', path: 'app.html#/settings/customization' },
    { label: 'Profile', path: 'app.html#/profile' },
    { label: 'Onboarding', path: 'app.html#/onboarding' },
  ]
  const visibleBranding: Array<{
    label: string
    hasPannamos: boolean
    browserosMatches: string[]
  }> = []

  for (const route of routes) {
    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/${route.path}`,
    })
    await sleep(1800)

    const bodyText = await readPageBodyText(page, route.label)
    const browserosMatches = bodyText.match(/\bbrowseros\b/gi) ?? []
    assert(
      browserosMatches.length === 0,
      `${route.label} shows BrowserOS branding: ${browserosMatches.join(', ')}`,
    )
    visibleBranding.push({
      label: route.label,
      hasPannamos: bodyText.includes('PannamOS'),
      browserosMatches,
    })
  }

  await page.send('Page.navigate', {
    url: `chrome-extension://${extensionId}/sidepanel.html`,
  })
  await sleep(1800)
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const newConversationButton = Array.from(document.querySelectorAll('button'))
        .find((button) =>
          /new conversation/i.test(
            button.innerText || button.getAttribute('aria-label') || '',
          )
        );
      newConversationButton?.click();
    })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  await sleep(800)

  const sidepanelText = await readPageBodyText(page, 'Sidepanel')
  const sidepanelMatches = sidepanelText.match(/\bbrowseros\b/gi) ?? []
  assert(
    sidepanelMatches.length === 0,
    `Sidepanel shows BrowserOS branding: ${sidepanelMatches.join(', ')}`,
  )
  visibleBranding.push({
    label: 'Sidepanel',
    hasPannamos: sidepanelText.includes('PannamOS'),
    browserosMatches: sidepanelMatches,
  })

  return visibleBranding
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  assert(response.ok, `${url} returned ${response.status}`)
  return response.json() as Promise<T>
}

function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function isLocalHost(host: string, extensionId: string) {
  return host === extensionId || isLoopbackHost(host)
}

function isLoopbackHost(host: string) {
  const normalized = host.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized.startsWith('localhost:') ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.0.0.1:') ||
    normalized === '[::1]' ||
    normalized.startsWith('[::1]:')
  )
}

function isChatRequestUrl(url: string) {
  try {
    const parsed = new URL(url)
    return (
      parsed.host === `127.0.0.1:${serverPort}` &&
      (parsed.pathname === '/chat' ||
        /^\/agents\/[^/]+\/sidepanel\/chat$/.test(parsed.pathname))
    )
  } catch {
    return false
  }
}

function isGoalLoopPlanRequestUrl(url: string) {
  try {
    const parsed = new URL(url)
    return (
      parsed.host === `127.0.0.1:${serverPort}` &&
      parsed.pathname === '/local/goals/plan'
    )
  } catch {
    return false
  }
}

function isGoalLoopRunRequestUrl(url: string) {
  try {
    const parsed = new URL(url)
    return (
      parsed.host === `127.0.0.1:${serverPort}` &&
      /^\/local\/goals\/[^/]+\/run$/.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

function isAgentSidepanelChatRequestUrl(url: string, agentId: string) {
  try {
    const parsed = new URL(url)
    return (
      parsed.host === `127.0.0.1:${serverPort}` &&
      parsed.pathname === `/agents/${agentId}/sidepanel/chat`
    )
  } catch {
    return false
  }
}

function localJsonHeaders() {
  return {
    'Content-Type': 'application/json',
    Origin: `http://127.0.0.1:${serverPort}`,
  }
}

function resolveLiveBrowserosDir() {
  const explicit = process.env.BROWSEROS_DIR?.trim()
  if (explicit) return explicit

  const localAppData = process.env.LOCALAPPDATA?.trim()
  if (localAppData)
    return join(localAppData, 'PannamOS', 'User Data', '.pannamos')

  return join(homedir(), '.pannamos')
}

async function verifyCapabilities() {
  const capabilities = await fetchJson<{
    adapters: Array<{ id: string }>
    skills: Array<{ id: string; source: string }>
    roles: Array<{ id: string }>
    localFirst: boolean
    cloud: {
      browserosLoginRequired: boolean
      browserosCloudSync: boolean
      managedAppAuth: boolean
    }
  }>(`http://127.0.0.1:${serverPort}/local/agent-capabilities`)

  assert(capabilities.localFirst === true, 'localFirst flag is not true')
  assert(
    capabilities.cloud.browserosLoginRequired === false,
    'BrowserOS login is still marked as required',
  )
  assert(
    capabilities.cloud.browserosCloudSync === false,
    'BrowserOS cloud sync is still enabled',
  )
  assert(
    capabilities.cloud.managedAppAuth === false,
    'BrowserOS managed app auth is still enabled',
  )

  const adapterIds = new Set(capabilities.adapters.map((adapter) => adapter.id))
  for (const adapter of ['claude', 'codex', 'hermes']) {
    assert(adapterIds.has(adapter), `Missing local agent adapter: ${adapter}`)
  }

  const skillIds = new Set(capabilities.skills.map((skill) => skill.id))
  for (const skill of requiredRuntimeSkills) {
    assert(skillIds.has(skill), `Missing local runtime skill: ${skill}`)
  }
  assert(
    capabilities.skills.some((skill) => skill.source === 'repo_skill'),
    'No repository-bundled skills are exposed',
  )

  const roleIds = new Set(capabilities.roles.map((role) => role.id))
  for (const role of requiredRoles) {
    assert(roleIds.has(role), `Missing local role template: ${role}`)
  }

  return {
    adapterCount: capabilities.adapters.length,
    skillCount: capabilities.skills.length,
    roleCount: capabilities.roles.length,
  }
}

async function verifyLiveLocalSessions() {
  const sessionId = `live-local-verify-${Date.now()}`
  const firstMessage = {
    id: `${sessionId}-user-1`,
    role: 'user',
    parts: [{ type: 'text', text: 'Local live verifier user message' }],
  }
  const secondMessage = {
    id: `${sessionId}-assistant-1`,
    role: 'assistant',
    parts: [{ type: 'text', text: 'Local live verifier assistant message' }],
  }
  const appendedMessage = {
    id: `${sessionId}-user-2`,
    role: 'user',
    parts: [{ type: 'text', text: 'Local live verifier appended message' }],
  }

  try {
    const created = await fetchJson<{
      session: { id: string; messages: unknown[] }
    }>(`http://127.0.0.1:${serverPort}/local/sessions`, {
      method: 'POST',
      headers: localJsonHeaders(),
      body: JSON.stringify({
        id: sessionId,
        title: 'Live local verifier',
        status: 'active',
        messages: [firstMessage, secondMessage],
        lastMessagedAt: Date.now(),
        metadata: { verifier: 'verify-live-local-browseros' },
      }),
    })
    assert(
      created.session.id === sessionId,
      'Live session create returned wrong id',
    )
    assert(
      created.session.messages.length === 2,
      'Live session create did not persist messages',
    )

    const fetched = await fetchJson<{
      session: { id: string; messages: unknown[] }
    }>(`http://127.0.0.1:${serverPort}/local/sessions/${sessionId}`)
    assert(
      fetched.session.id === sessionId,
      'Live session fetch returned wrong id',
    )
    assert(
      fetched.session.messages.length === 2,
      'Live session fetch did not restore messages',
    )

    const appended = await fetchJson<{
      session: { id: string; messages: unknown[] }
    }>(`http://127.0.0.1:${serverPort}/local/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: localJsonHeaders(),
      body: JSON.stringify({ message: appendedMessage }),
    })
    assert(
      appended.session.messages.length === 3,
      'Live session append did not persist the message',
    )

    const audit = await fetchJson<{ event: { id: string; sessionId: string } }>(
      `http://127.0.0.1:${serverPort}/local/audit`,
      {
        method: 'POST',
        headers: localJsonHeaders(),
        body: JSON.stringify({
          sessionId,
          type: 'verify.live.local',
          summary: 'Live verifier recorded a local audit event',
          payload: { verifier: 'verify-live-local-browseros' },
        }),
      },
    )
    assert(
      audit.event.sessionId === sessionId,
      'Live audit event returned wrong session id',
    )

    const auditList = await fetchJson<{ events: unknown[] }>(
      `http://127.0.0.1:${serverPort}/local/sessions/${sessionId}/audit`,
    )
    assert(auditList.events.length > 0, 'Live audit event was not restored')

    const listed = await fetchJson<{
      sessions: Array<{ id: string; messages: unknown[] }>
    }>(`http://127.0.0.1:${serverPort}/local/sessions`)
    assert(
      listed.sessions.some((session) => session.id === sessionId),
      'Live session list did not include the verifier session',
    )

    return {
      sessionId,
      messageCount: appended.session.messages.length,
      auditEventCount: auditList.events.length,
    }
  } finally {
    await fetch(`http://127.0.0.1:${serverPort}/local/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Origin: `http://127.0.0.1:${serverPort}` },
    }).catch(() => undefined)
  }
}

async function removeConversationCacheEntry(
  page: PageCdpConnection,
  sessionId: string,
) {
  const result = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        if (!globalThis.chrome?.storage?.local) {
          resolve({ ok: false, reason: 'chrome.storage.local unavailable' });
          return;
        }
        const sessionId = ${JSON.stringify(sessionId)};
        chrome.storage.local.get(['conversations'], (values) => {
          const current = Array.isArray(values.conversations)
            ? values.conversations.filter((conversation) =>
                conversation?.id !== sessionId
              )
            : [];
          chrome.storage.local.set({ conversations: current }, () => {
            const error = chrome.runtime.lastError?.message;
            resolve(error ? { ok: false, reason: error } : { ok: true });
          });
        });
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    'Remove live local UI session from conversation cache',
  )
  assert(
    result.ok,
    `Failed to remove live local UI session cache entry: ${result.reason}`,
  )
}

async function verifyLiveLocalSessionUiRestore(
  page: PageCdpConnection,
  extensionId: string,
) {
  const sessionId = crypto.randomUUID()
  const restoreMarker = `live-local-ui-restore-${Date.now()}`
  const userText = `Live UI restore user message ${restoreMarker}`
  const assistantText = `Live UI restore assistant message ${restoreMarker}`
  const messages = [
    {
      id: `${sessionId}-user-1`,
      role: 'user',
      parts: [{ type: 'text', text: userText }],
    },
    {
      id: `${sessionId}-assistant-1`,
      role: 'assistant',
      parts: [{ type: 'text', text: assistantText }],
    },
  ]

  try {
    const created = await fetchJson<{
      session: { id: string; messages: unknown[] }
    }>(`http://127.0.0.1:${serverPort}/local/sessions`, {
      method: 'POST',
      headers: localJsonHeaders(),
      body: JSON.stringify({
        id: sessionId,
        title: 'Live UI restore verifier',
        status: 'active',
        messages,
        lastMessagedAt: Date.now() + 60_000,
        metadata: { verifier: 'verify-live-local-browseros-ui' },
      }),
    })
    assert(
      created.session.id === sessionId,
      'UI restore seed returned wrong id',
    )
    assert(
      created.session.messages.length === messages.length,
      'UI restore seed did not persist messages',
    )

    await page.send('Page.navigate', { url: 'about:blank' })
    await sleep(500)
    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/app.html#/home/chat`,
    })
    await waitForPageText(
      page,
      [userText, assistantText],
      'latest local session restore after extension reopen',
    )

    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/app.html#/home/chat/history`,
    })
    await waitForPageText(page, [userText], 'local chat history list')

    await page.send('Page.navigate', { url: 'about:blank' })
    await sleep(500)
    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/app.html#/home/chat?conversationId=${encodeURIComponent(sessionId)}`,
    })
    await waitForPageText(
      page,
      [userText, assistantText],
      'explicit local session restore by conversation id',
    )

    return {
      sessionId,
      messageCount: messages.length,
      latestRestoreVisible: true,
      historyVisible: true,
      explicitRestoreVisible: true,
    }
  } finally {
    await fetch(`http://127.0.0.1:${serverPort}/local/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Origin: `http://127.0.0.1:${serverPort}` },
    }).catch(() => undefined)
    await page
      .send('Page.navigate', {
        url: `chrome-extension://${extensionId}/app.html#/home/chat`,
      })
      .catch(() => undefined)
    await sleep(500)
    await removeConversationCacheEntry(page, sessionId).catch(() => undefined)
  }
}

async function createTempLocalAgent(): Promise<TempLocalAgent> {
  const name = `Live Local Verifier Agent ${Date.now()}`
  const response = await fetchJson<{
    agent: { id: string; name: string }
  }>(`http://127.0.0.1:${serverPort}/agents`, {
    method: 'POST',
    headers: localJsonHeaders(),
    body: JSON.stringify({
      name,
      adapter: 'codex',
      modelId: 'gpt-5.5',
      reasoningEffort: 'medium',
      roleId: 'research-analyst',
    }),
  })

  assert(response.agent.id, 'Temporary local agent create returned no id')
  assert(
    response.agent.name === name,
    'Temporary local agent create returned wrong name',
  )

  const listed = await fetchJson<{
    agents: Array<{ id: string; name: string }>
  }>(`http://127.0.0.1:${serverPort}/agents`)
  assert(
    listed.agents.some((agent) => agent.id === response.agent.id),
    'Temporary local agent was not listed by /agents',
  )

  return response.agent
}

async function verifyTempAgentBootstrap(agent: TempLocalAgent) {
  const agentHome = join(
    liveBrowserosDir,
    'agents',
    'harness',
    agent.id,
    'home',
  )
  const [agentsMd, soulMd, toolsMd, roleMd] = await Promise.all([
    readFile(join(agentHome, 'AGENTS.md'), 'utf8'),
    readFile(join(agentHome, 'SOUL.md'), 'utf8'),
    readFile(join(agentHome, 'TOOLS.md'), 'utf8'),
    readFile(join(agentHome, 'ROLE.md'), 'utf8'),
  ])

  assert(
    agentsMd.includes('source synthesis specialist'),
    'Temporary local agent AGENTS.md is missing Research Analyst guidance',
  )
  assert(
    soulMd.includes('careful research analyst'),
    'Temporary local agent SOUL.md is missing research analyst identity',
  )
  assert(
    toolsMd.includes('tab-workflows'),
    'Temporary local agent TOOLS.md is missing tab-workflows skill guidance',
  )
  assert(
    roleMd.includes('Use logged-in sources: ask'),
    'Temporary local agent ROLE.md is missing approval boundary summary',
  )

  return {
    agentHome,
    files: ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'ROLE.md'],
  }
}

async function deleteTempLocalAgent(agentId: string) {
  await fetch(`http://127.0.0.1:${serverPort}/agents/${agentId}`, {
    method: 'DELETE',
    headers: { Origin: `http://127.0.0.1:${serverPort}` },
  }).catch(() => undefined)
}

async function selectSidepanelAgentTarget(
  page: PageCdpConnection,
  agent: TempLocalAgent,
  extensionId: string,
) {
  const stored = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const selection = { kind: 'acp', id: ${JSON.stringify(agent.id)} };
        chrome.storage.local.set(
          {
            'sidepanel-chat-target-selection': selection,
            'local:sidepanel-chat-target-selection': selection,
          },
          () => {
            const error = chrome.runtime.lastError?.message;
            resolve(error ? { ok: false, reason: error } : { ok: true });
          },
        );
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    'Persist temporary local agent target selection',
  )
  assert(
    stored.ok,
    `Failed to persist local agent target selection: ${stored.reason}`,
  )

  await page.send('Page.navigate', { url: 'about:blank' })
  await sleep(500)
  await page.send('Page.navigate', {
    url: `chrome-extension://${extensionId}/app.html#/home/chat`,
  })

  const deadline = Date.now() + 8000
  let activeTarget = ''
  while (Date.now() < deadline) {
    await sleep(250)
    activeTarget = runtimeValue<string>(
      await page.send('Runtime.evaluate', {
        expression: `(() => {
          const trigger = Array.from(document.querySelectorAll('button'))
            .find((candidate) => candidate.getAttribute('title') === 'Change AI Provider');
          return trigger?.innerText.trim() ?? '';
        })()`,
        returnByValue: true,
      }),
      'Read selected sidepanel provider target',
    )
    if (activeTarget.includes(agent.name)) return
  }

  throw new Error(
    `Temporary local agent did not become selected target: ${activeTarget}`,
  )
}

async function clearSidepanelAgentTargetSelection(page: PageCdpConnection) {
  await page.send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      if (!globalThis.chrome?.storage?.local) {
        resolve({ ok: false, reason: 'chrome.storage.local unavailable' });
        return;
      }
      chrome.storage.local.remove(
        [
          'sidepanel-chat-target-selection',
          'local:sidepanel-chat-target-selection',
        ],
        () => resolve({ ok: !chrome.runtime.lastError }),
      );
    })`,
    returnByValue: true,
    awaitPromise: true,
  })
}

async function ensureSidepanelChatMode(
  page: PageCdpConnection,
  mode: (typeof requiredModeUi)[number],
) {
  const currentModeLabel = runtimeValue<string | null>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const triggerLabels = new Set(${JSON.stringify(
          requiredModeUi.map((candidate) => candidate.label),
        )});
        const trigger = Array.from(document.querySelectorAll('button'))
          .find((candidate) => triggerLabels.has(candidate.innerText.trim()));
        return trigger?.innerText.trim() ?? null;
      })()`,
      returnByValue: true,
    }),
    `Read current mode before ${mode.label} submit`,
  )

  if (currentModeLabel === mode.label) return

  const opened = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const triggerLabels = new Set(${JSON.stringify(
          requiredModeUi.map((candidate) => candidate.label),
        )});
        const trigger = Array.from(document.querySelectorAll('button'))
          .find((candidate) => triggerLabels.has(candidate.innerText.trim()));
        if (!trigger) return { ok: false, reason: 'missing mode trigger' };
        trigger.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    }),
    `Open mode picker for ${mode.label} submit`,
  )
  assert(
    opened.ok,
    `Failed to open mode picker for ${mode.label}: ${opened.reason}`,
  )

  await sleep(200)

  const selected = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const mode = ${JSON.stringify(mode)};
        const option = Array.from(document.querySelectorAll('button'))
          .find((candidate) =>
            candidate.innerText.includes(mode.label) &&
            candidate.innerText.includes(mode.description)
          );
        if (!option) return { ok: false, reason: 'missing mode option' };
        option.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    }),
    `Select ${mode.label} before submit`,
  )
  assert(
    selected.ok,
    `Failed to select ${mode.label} before submit: ${selected.reason}`,
  )

  await sleep(200)
}

async function fillSidepanelTextarea(
  page: PageCdpConnection,
  message: string,
  label: string,
) {
  const focused = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) return { ok: false, reason: 'missing textarea' };
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        valueSetter?.call(textarea, '');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        return { ok: true };
      })()`,
      returnByValue: true,
    }),
    `Focus ${label} textarea`,
  )
  assert(focused.ok, `Failed to focus ${label} textarea: ${focused.reason}`)

  await page.send('Input.insertText', { text: message })
  await sleep(200)

  const state = runtimeValue<{
    value: string
    submitDisabled: boolean | null
  }>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('textarea');
        const submitButton = textarea?.form?.querySelector('button[type="submit"]');
        return {
          value: textarea?.value ?? '',
          submitDisabled: submitButton ? submitButton.disabled : null,
        };
      })()`,
      returnByValue: true,
    }),
    `Read ${label} textarea after fill`,
  )
  assert(
    state.value === message,
    `${label} textarea contained wrong value: ${state.value}`,
  )
  assert(
    state.submitDisabled !== true,
    `${label} submit button stayed disabled after fill`,
  )
}

async function submitSidepanelTextarea(page: PageCdpConnection, label: string) {
  const submit = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea?.form) return { ok: false, reason: 'missing chat form' };
        textarea.form.requestSubmit();
        return { ok: true };
      })()`,
      returnByValue: true,
    }),
    `Submit ${label} live local request`,
  )
  assert(submit.ok, `Failed to submit live local ${label}: ${submit.reason}`)
}

async function waitForGoalLoopCompletion(goalId: string, label: string) {
  type ProgressResponse = {
    progress: {
      status: string
      queueCounts: {
        pending: number
        running: number
        completed: number
        skipped: number
        failed: number
        blocked: number
      }
      manifest?: {
        totals?: {
          completed: number
          skipped: number
          failed: number
          blocked: number
          pending: number
        }
      }
    }
  }

  const deadline = Date.now() + 120_000
  let latest: ProgressResponse | null = null
  while (Date.now() < deadline) {
    latest = await fetchJson<ProgressResponse>(
      `http://127.0.0.1:${serverPort}/local/goals/${encodeURIComponent(
        goalId,
      )}/progress`,
    )
    if (
      latest.progress.status === 'completed' ||
      latest.progress.status === 'blocked' ||
      latest.progress.status === 'cancelled'
    ) {
      return latest.progress
    }
    await sleep(500)
  }

  throw new Error(
    `Timed out waiting for ${label} Goal Loop progress: ${JSON.stringify(
      latest,
    )}`,
  )
}

async function verifyGoalLoopModeRequest(
  page: PageCdpConnection,
  mode: (typeof requiredModeUi)[number],
) {
  const message = `Open https://example.com and verify the page locally. Live verifier marker ${Date.now()}`
  const beforeUrlCount = page.requestUrls.length

  await fillSidepanelTextarea(page, message, mode.label)
  await submitSidepanelTextarea(page, mode.label)

  const planUrl = await waitForRequestUrl(
    page,
    beforeUrlCount,
    isGoalLoopPlanRequestUrl,
    'local Goal Loop plan request',
    30_000,
  )
  const runUrl = await waitForRequestUrl(
    page,
    beforeUrlCount,
    isGoalLoopRunRequestUrl,
    'local Goal Loop run request',
    120_000,
  )

  const goalId = new URL(runUrl).pathname.split('/')[3]
  assert(goalId, `Could not parse Goal Loop id from run URL: ${runUrl}`)
  const progress = await waitForGoalLoopCompletion(goalId, mode.label)
  assert(
    progress.status === 'completed',
    `Goal Loop finished with status ${progress.status}`,
  )
  assert(
    progress.queueCounts.completed > 0,
    `Goal Loop completed without completing any queue item: ${JSON.stringify(
      progress.queueCounts,
    )}`,
  )
  assert(Boolean(progress.manifest), 'Goal Loop completed without a manifest')

  await waitForPageText(
    page,
    ['Goal Loop complete.', 'Completed:'],
    'Goal Loop sidepanel completion summary',
    30_000,
  )

  return { planUrl, runUrl, progress }
}

async function verifyModeRequestBodies(page: PageCdpConnection) {
  const results: Array<{
    label: string
    url: string
    mode: unknown
    message: unknown
    customMcpServers: unknown
    enabledMcpServers: unknown
    provider: unknown
    providerType: unknown
    providerName: unknown
    apiKey: unknown
    baseUrl: unknown
    model: unknown
  }> = []

  for (const mode of requiredModeUi) {
    const message = `Live local verifier ${mode.id} request ${Date.now()}`
    const beforeCount = page.capturedChatRequests.length

    await ensureSidepanelChatMode(page, mode)

    if (mode.id === 'goal') {
      await verifyGoalLoopModeRequest(page, mode)
      continue
    }

    await fillSidepanelTextarea(page, message, mode.label)
    await submitSidepanelTextarea(page, mode.label)

    await waitForCapturedChatRequest(page, beforeCount + 1, mode.label)
    const request = page.capturedChatRequests[beforeCount]
    assert(request, `Missing captured request for ${mode.label}`)
    assert(
      isChatRequestUrl(request.url),
      `Captured non-chat request for ${mode.label}: ${request.url}`,
    )
    assert(
      request.postData,
      `Captured chat request for ${mode.label} did not include a request body`,
    )

    const body = JSON.parse(request.postData)
    assert(
      body.mode === mode.id,
      `Captured ${mode.label} request sent mode ${String(body.mode)}`,
    )
    assert(
      body.message === message,
      `Captured ${mode.label} request sent wrong message`,
    )

    results.push({
      label: mode.label,
      url: request.url,
      mode: body.mode,
      message: body.message,
      customMcpServers: body.browserContext?.customMcpServers,
      enabledMcpServers: body.browserContext?.enabledMcpServers,
      provider: body.provider,
      providerType: body.providerType,
      providerName: body.providerName,
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      model: body.model,
    })

    await sleep(300)
  }

  return results
}

async function verifyAgentModeRequestBodies(
  page: PageCdpConnection,
  agent: TempLocalAgent,
  extensionId: string,
) {
  await selectSidepanelAgentTarget(page, agent, extensionId)

  const allModeRequests = await verifyModeRequestBodies(page)
  const agentModeRequests = allModeRequests.filter((request) =>
    isAgentSidepanelChatRequestUrl(request.url, agent.id),
  )
  const expectedAgentChatModeCount = requiredModeUi.filter(
    (mode) => mode.id !== 'goal',
  ).length
  assert(
    agentModeRequests.length === expectedAgentChatModeCount,
    `Expected ${expectedAgentChatModeCount} local agent sidepanel requests, captured ${agentModeRequests.length}`,
  )

  return agentModeRequests
}

async function snapshotChromeLocalStorage(
  page: PageCdpConnection,
  keys: string[],
  label: string,
) {
  const snapshot = runtimeValue<{
    ok: boolean
    values?: Record<string, unknown>
    presentKeys?: string[]
    reason?: string
  }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const keys = ${JSON.stringify(keys)};
        chrome.storage.local.get(keys, (values) => {
          const error = chrome.runtime.lastError?.message;
          if (error) {
            resolve({ ok: false, reason: error });
            return;
          }
          resolve({
            ok: true,
            values,
            presentKeys: keys.filter((key) => Object.prototype.hasOwnProperty.call(values, key)),
          });
        });
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    `Snapshot ${label} local storage`,
  )
  assert(snapshot.ok, `Failed to snapshot ${label}: ${snapshot.reason}`)
  return snapshot
}

async function restoreChromeLocalStorage(
  page: PageCdpConnection,
  keys: string[],
  snapshot: { values?: Record<string, unknown>; presentKeys?: string[] },
  label: string,
) {
  const restored = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const keys = ${JSON.stringify(keys)};
        const values = ${JSON.stringify(snapshot.values ?? {})};
        const presentKeys = new Set(${JSON.stringify(
          snapshot.presentKeys ?? [],
        )});
        const toRemove = keys.filter((key) => !presentKeys.has(key));
        chrome.storage.local.remove(toRemove, () => {
          chrome.storage.local.set(values, () => {
            const error = chrome.runtime.lastError?.message;
            resolve(error ? { ok: false, reason: error } : { ok: true });
          });
        });
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    `Restore ${label} local storage`,
  )
  assert(restored.ok, `Failed to restore ${label}: ${restored.reason}`)
}

async function seedLiveLocalMcpStorage(page: PageCdpConnection) {
  const result = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const localConnector = ${JSON.stringify(liveVerifierLocalMcpServer)};
        const remoteConnector = ${JSON.stringify(liveVerifierRemoteMcpServer)};
        chrome.storage.local.get(['mcpServers'], (values) => {
          const current = Array.isArray(values.mcpServers)
            ? values.mcpServers.filter((server) =>
                !String(server?.id ?? '').startsWith('live-local-verifier-') &&
                !String(server?.id ?? '').startsWith('live-remote-verifier-')
              )
            : [];
          chrome.storage.local.set(
            { mcpServers: [...current, localConnector, remoteConnector] },
            () => {
              const error = chrome.runtime.lastError?.message;
              resolve(error ? { ok: false, reason: error } : { ok: true });
            },
          );
        });
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    'Seed live local MCP storage',
  )
  assert(result.ok, `Failed to seed live local MCP storage: ${result.reason}`)
}

async function seedLiveLocalProviderStorage(page: PageCdpConnection) {
  const result = runtimeValue<{ ok: boolean; reason?: string }>(
    await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const liveProvider = ${JSON.stringify(liveVerifierProvider)};
        chrome.storage.local.get(['llm-providers'], (values) => {
          const current = Array.isArray(values['llm-providers'])
            ? values['llm-providers'].filter((provider) =>
                provider?.id !== liveProvider.id
              )
            : [];
          chrome.storage.local.set(
            {
              'llm-providers': [...current, liveProvider],
              'default-provider-id': liveProvider.id,
            },
            () => {
              const error = chrome.runtime.lastError?.message;
              resolve(error ? { ok: false, reason: error } : { ok: true });
            },
          );
        });
      })`,
      returnByValue: true,
      awaitPromise: true,
    }),
    'Seed live local provider storage',
  )
  assert(
    result.ok,
    `Failed to seed live local provider storage: ${result.reason}`,
  )

  await clearSidepanelAgentTargetSelection(page)
}

function verifyLocalConnectorRequests(
  requests: Array<{
    label: string
    customMcpServers: unknown
    enabledMcpServers: unknown
  }>,
  label: string,
) {
  for (const request of requests) {
    assert(
      request.enabledMcpServers === undefined,
      `${label} ${request.label} sent managed MCP server ids`,
    )

    if (request.label === 'Chat') {
      assert(
        request.customMcpServers === undefined,
        `${label} Chat sent connector tools despite read-only mode`,
      )
      continue
    }

    assert(
      Array.isArray(request.customMcpServers),
      `${label} ${request.label} did not include local connector tools`,
    )
    assert(
      request.customMcpServers.length === 1,
      `${label} ${request.label} sent unexpected connector count`,
    )
    assert(
      request.customMcpServers[0]?.name === 'Live Local Connector',
      `${label} ${request.label} sent wrong connector name`,
    )
    assert(
      request.customMcpServers[0]?.url === 'http://127.0.0.1:7777/sse',
      `${label} ${request.label} sent wrong connector URL`,
    )
    assert(
      JSON.stringify(request.customMcpServers).includes('mcp.example.com') ===
        false,
      `${label} ${request.label} leaked a remote MCP connector`,
    )
  }
}

function verifyLocalProviderRequests(
  requests: Array<{
    label: string
    provider: unknown
    providerType: unknown
    providerName: unknown
    apiKey: unknown
    baseUrl: unknown
    model: unknown
  }>,
  label: string,
) {
  const browserOsHost = ['browseros', 'com'].join('.')

  for (const request of requests) {
    assert(
      request.provider === liveVerifierProvider.type,
      `${label} ${request.label} sent wrong provider ${String(request.provider)}`,
    )
    assert(
      request.providerType === liveVerifierProvider.type,
      `${label} ${request.label} sent wrong provider type ${String(request.providerType)}`,
    )
    assert(
      request.providerName === liveVerifierProvider.name,
      `${label} ${request.label} sent wrong provider name ${String(request.providerName)}`,
    )
    assert(
      request.baseUrl === liveVerifierProvider.baseUrl,
      `${label} ${request.label} sent wrong base URL ${String(request.baseUrl)}`,
    )
    assert(
      request.model === liveVerifierProvider.modelId,
      `${label} ${request.label} sent wrong model ${String(request.model)}`,
    )
    assert(
      request.apiKey === undefined,
      `${label} ${request.label} unexpectedly sent an API key`,
    )
    assert(
      JSON.stringify(request).includes(browserOsHost) === false,
      `${label} ${request.label} leaked a BrowserOS host in provider request data`,
    )
  }
}

async function verifyLocalRuntimeCapabilitiesUi(
  page: PageCdpConnection,
  extensionId: string,
) {
  const capabilities = await fetchJson<{
    adapters: Array<{ id: string; name: string }>
    skills: Array<{ id: string; name: string; source: string }>
    roles: Array<{ id: string; name: string }>
    localFirst: boolean
    cloud: {
      browserosLoginRequired: boolean
      browserosCloudSync: boolean
      managedAppAuth: boolean
    }
  }>(`http://127.0.0.1:${serverPort}/local/agent-capabilities`)

  await page.send('Page.navigate', {
    url: `chrome-extension://${extensionId}/app.html#/settings/ai`,
  })

  const requiredTexts = [
    'Local runtime',
    'Local first',
    'Agents',
    'Roles',
    'Skills',
    ...capabilities.adapters.map((adapter) => adapter.name),
    ...capabilities.roles.map((role) => role.name),
    ...requiredRuntimeSkills,
  ]
  const settingsText = await waitForPageText(
    page,
    requiredTexts,
    'local runtime capabilities UI',
  )

  assert(capabilities.localFirst, 'Local capabilities API is not local-first')
  assert(
    capabilities.cloud.browserosLoginRequired === false,
    'Local capabilities API still requires BrowserOS login',
  )
  assert(
    capabilities.cloud.browserosCloudSync === false,
    'Local capabilities API still enables BrowserOS cloud sync',
  )
  assert(
    capabilities.cloud.managedAppAuth === false,
    'Local capabilities API still enables BrowserOS managed app auth',
  )

  const repoSkillCount = capabilities.skills.filter(
    (skill) => skill.source === 'repo_skill',
  ).length
  const runtimeSkillCount = capabilities.skills.filter(
    (skill) => skill.source === 'local_runtime',
  ).length
  assert(repoSkillCount > 0, 'Local capabilities UI has no repository skills')
  assert(runtimeSkillCount > 0, 'Local capabilities UI has no runtime skills')
  assert(
    /\bREPO\b|\bRepo\b/.test(settingsText),
    'Local capabilities UI is missing the repository skill badge',
  )
  assert(
    /\bRUNTIME\b|\bRuntime\b/.test(settingsText),
    'Local capabilities UI is missing the runtime skill badge',
  )

  for (const skill of requiredRuntimeSkills) {
    assert(
      settingsText.includes(skill),
      `Local capabilities UI is missing skill ${skill}`,
    )
  }

  return {
    adapterCount: capabilities.adapters.length,
    roleCount: capabilities.roles.length,
    skillCount: capabilities.skills.length,
    repoSkillCount,
    runtimeSkillCount,
    requiredSkillsVisible: requiredRuntimeSkills.length,
  }
}

async function verifyLocalAppsAndConnectorsUi(
  page: PageCdpConnection,
  extensionId: string,
) {
  const catalog = await fetchJson<{
    servers: Array<{
      name: string
      description: string
      connectionMode?: string
    }>
    count: number
  }>(`http://127.0.0.1:${serverPort}/local/apps/catalog`)
  assert(catalog.count > 0, 'Local app catalog is empty')
  assert(
    catalog.servers.every(
      (server) => server.connectionMode === 'local_catalog',
    ),
    'Local app catalog returned a non-local connection mode',
  )
  assert(
    catalog.servers.some((server) => server.name === 'Gmail'),
    'Local app catalog is missing Gmail',
  )

  const addResponse = await fetchJson<Record<string, unknown>>(
    `http://127.0.0.1:${serverPort}/local/apps/add`,
    {
      method: 'POST',
      headers: localJsonHeaders(),
      body: JSON.stringify({ serverName: 'Gmail' }),
    },
  )
  assert(
    addResponse.connectionMode === 'local_catalog',
    'Local app add did not return local catalog mode',
  )
  assert(
    addResponse.oauthUrl === undefined && addResponse.apiKeyUrl === undefined,
    'Local app add returned a BrowserOS auth URL',
  )

  const remoteConnectorResponse = await fetch(
    `http://127.0.0.1:${serverPort}/local/apps/check-connector`,
    {
      method: 'POST',
      headers: localJsonHeaders(),
      body: JSON.stringify({ url: 'https://mcp.example.com/sse' }),
    },
  )
  assert(
    remoteConnectorResponse.status === 400,
    `Remote connector URL was not rejected: ${remoteConnectorResponse.status}`,
  )

  await page.send('Page.navigate', {
    url: `chrome-extension://${extensionId}/app.html#/connect-apps`,
  })

  const bodyText = await waitForPageText(
    page,
    [
      'Connected Apps',
      'Add local app catalog entries',
      'Add catalog app',
      'Add custom app',
      'Your Connected Apps',
      'Local App Catalog',
      liveVerifierLocalMcpServer.displayName,
      'Live local MCP',
      '1 local tools available',
      'Connected',
      'Edit connector',
    ],
    'local app catalog and connector UI',
  )
  assert(
    !bodyText.includes('Sign in to BrowserOS'),
    'Connect Apps UI still asks for BrowserOS sign-in',
  )

  return {
    catalogCount: catalog.count,
    seededConnectorVisible: true,
    remoteConnectorRejected: true,
    cloudAuthUrlsAbsent: true,
  }
}

async function verifyScheduledTaskModes(
  page: PageCdpConnection,
  extensionId: string,
) {
  const tempJobs = requiredModeUi.map((mode) => ({
    id: `live-local-scheduled-${mode.id}-${Date.now()}`,
    name: `Live Local ${mode.label} Scheduled Task`,
    query: `Live local scheduled ${mode.id} verifier prompt`,
    mode: mode.id,
    scheduleType: 'daily',
    scheduleTime: '09:00',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  const scheduledStorageKeys = [
    'scheduledJobs',
    'scheduledJobRuns',
    'scheduledJobsPendingDeletion',
  ]
  const storageSnapshot = await snapshotChromeLocalStorage(
    page,
    scheduledStorageKeys,
    'scheduled task',
  )

  let verificationResult:
    | {
        modeOptions?: string[]
        persistedModes: Array<{
          id: string
          mode: unknown
          cardVisible: boolean
          modeVisible: boolean
        }>
      }
    | undefined
  let verificationError: unknown

  try {
    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/app.html#/scheduled`,
    })
    await sleep(2500)

    const modeDialogResult = runtimeValue<{
      ok: boolean
      bodyText?: string
      modeOptions?: string[]
      reason?: string
    }>(
      await page.send('Runtime.evaluate', {
        expression: `(async () => {
          const wait = () => new Promise((resolve) => setTimeout(resolve, 75));
          const newTaskButton = Array.from(document.querySelectorAll('button'))
            .find((button) => button.innerText.includes('New Task'));
          if (!newTaskButton) {
            return { ok: false, reason: 'missing New Task button' };
          }
          newTaskButton.click();
          await wait();

          const modeLabels = new Set(${JSON.stringify(
            requiredModeUi.map((mode) => mode.label),
          )});
          const modeTrigger = Array.from(document.querySelectorAll('[role="combobox"], button'))
            .find((candidate) => modeLabels.has(candidate.innerText.trim()));
          if (!modeTrigger) {
            return { ok: false, reason: 'missing mode select trigger' };
          }
          modeTrigger.click();
          await wait();

          const modeOptions = Array.from(document.querySelectorAll('[role="option"]'))
            .map((option) => option.textContent?.trim())
            .filter(Boolean);

          return {
            ok: true,
            bodyText: document.body?.innerText ?? '',
            modeOptions,
          };
        })()`,
        returnByValue: true,
        awaitPromise: true,
      }),
      'Verify scheduled task mode dialog',
    )
    assert(
      modeDialogResult.ok,
      `Scheduled task mode dialog check failed: ${modeDialogResult.reason}`,
    )
    assert(
      modeDialogResult.bodyText?.includes('Create Scheduled Task'),
      'Scheduled task dialog did not open',
    )
    assert(
      modeDialogResult.bodyText?.includes('Mode'),
      'Scheduled task dialog is missing the Mode field',
    )
    for (const mode of requiredModeUi) {
      assert(
        modeDialogResult.modeOptions?.includes(mode.label),
        `Scheduled task mode select is missing ${mode.label}`,
      )
    }

    const seedStorage = runtimeValue<{ ok: boolean; reason?: string }>(
      await page.send('Runtime.evaluate', {
        expression: `new Promise((resolve) => {
          const tempJobs = ${JSON.stringify(tempJobs)};
          chrome.storage.local.get(['scheduledJobs'], (values) => {
            const existingJobs = Array.isArray(values.scheduledJobs)
              ? values.scheduledJobs.filter((job) =>
                  !String(job?.id ?? '').startsWith('live-local-scheduled-')
                )
              : [];
            chrome.storage.local.set(
              { scheduledJobs: [...existingJobs, ...tempJobs] },
              () => {
                const error = chrome.runtime.lastError?.message;
                resolve(error ? { ok: false, reason: error } : { ok: true });
              },
            );
          });
        })`,
        returnByValue: true,
        awaitPromise: true,
      }),
      'Seed temporary scheduled mode tasks',
    )
    assert(
      seedStorage.ok,
      `Failed to seed temporary scheduled tasks: ${seedStorage.reason}`,
    )

    await page.send('Page.navigate', {
      url: `chrome-extension://${extensionId}/app.html#/scheduled`,
    })
    await sleep(2500)

    const persistedModes = runtimeValue<
      Array<{
        id: string
        mode: unknown
        cardVisible: boolean
        modeVisible: boolean
      }>
    >(
      await page.send('Runtime.evaluate', {
        expression: `(() => {
          const jobs = ${JSON.stringify(tempJobs)};
          const cards = Array.from(
            document.querySelectorAll('[aria-label^="Disable"], [aria-label^="Enable"]'),
          ).map((control) => control.closest('.rounded-xl')?.innerText ?? '');
          return jobs.map((job) => {
            const cardText = cards.find((text) =>
              text.includes(job.name) && text.includes(job.query)
            ) ?? '';
            return {
              id: job.id,
              mode: job.mode,
              cardVisible: Boolean(cardText),
              modeVisible: cardText.includes(
                ${JSON.stringify(
                  Object.fromEntries(
                    requiredModeUi.map((mode) => [mode.id, mode.label]),
                  ),
                )}[job.mode],
              ),
            };
          });
        })()`,
        returnByValue: true,
      }),
      'Verify persisted scheduled mode cards',
    )

    for (const result of persistedModes) {
      assert(
        result.cardVisible,
        `Scheduled task card is missing for ${result.id}`,
      )
      assert(
        result.modeVisible,
        `Scheduled task card did not show mode ${String(result.mode)}`,
      )
    }

    verificationResult = {
      modeOptions: modeDialogResult.modeOptions,
      persistedModes,
    }
  } catch (error) {
    verificationError = error
  }

  await restoreChromeLocalStorage(
    page,
    scheduledStorageKeys,
    storageSnapshot,
    'scheduled task',
  )

  if (verificationError) throw verificationError
  assert(
    verificationResult,
    'Scheduled task mode verification returned no result',
  )
  return verificationResult
}

async function verifyExtensionUiAndNetwork() {
  const tempAgent = await createTempLocalAgent()
  const tempAgentBootstrap = await verifyTempAgentBootstrap(tempAgent)
  const browserVersion = await fetchJson<{
    webSocketDebuggerUrl: string
  }>(`http://127.0.0.1:${cdpPort}/json/version`)
  const targets = await fetchJson<CdpTarget[]>(
    `http://127.0.0.1:${cdpPort}/json/list`,
  )
  const serviceWorker = targets.find(
    (target) =>
      target.type === 'service_worker' &&
      target.url.startsWith('chrome-extension://'),
  )
  assert(serviceWorker, 'PannamOS extension service worker is not loaded')
  assert(
    serviceWorker.webSocketDebuggerUrl,
    'PannamOS extension service worker is missing a CDP debugger URL',
  )

  const extensionId = new URL(serviceWorker.url).host
  const worker = await PageCdpConnection.connect(
    serviceWorker.webSocketDebuggerUrl,
  )
  const browser = await CdpConnection.connect(
    browserVersion.webSocketDebuggerUrl,
  )
  let targetId: string | null = null

  try {
    await worker.send('Network.enable')

    const createTarget = await browser.send<{
      result: { targetId: string }
    }>('Target.createTarget', {
      url: 'about:blank',
      newWindow: false,
    })
    targetId = createTarget.result.targetId
    await sleep(500)

    const updatedTargets = await fetchJson<CdpTarget[]>(
      `http://127.0.0.1:${cdpPort}/json/list`,
    )
    const pageTarget = updatedTargets.find((target) => target.id === targetId)
    assert(pageTarget?.webSocketDebuggerUrl, 'Temporary page target missing')

    const page = await PageCdpConnection.connect(
      pageTarget.webSocketDebuggerUrl,
    )
    const providerStorageKeys = [
      'llm-providers',
      'default-provider-id',
      'sidepanel-chat-target-selection',
      'local:sidepanel-chat-target-selection',
    ]
    let providerStorageSnapshot:
      | { values?: Record<string, unknown>; presentKeys?: string[] }
      | undefined
    let mcpStorageSnapshot:
      | { values?: Record<string, unknown>; presentKeys?: string[] }
      | undefined
    try {
      await page.send('Network.enable')
      await page.send('Fetch.enable', {
        patterns: [
          {
            urlPattern: `http://127.0.0.1:${serverPort}/chat*`,
            requestStage: 'Request',
          },
          {
            urlPattern: `http://127.0.0.1:${serverPort}/agents/*/sidepanel/chat*`,
            requestStage: 'Request',
          },
        ],
      })
      await page.send('Page.enable')
      await page.send('Runtime.enable')
      await page.send('Page.navigate', {
        url: `chrome-extension://${extensionId}/app.html#/home/chat`,
      })
      await sleep(3000)
      providerStorageSnapshot = await snapshotChromeLocalStorage(
        page,
        providerStorageKeys,
        'local provider',
      )
      await seedLiveLocalProviderStorage(page)
      mcpStorageSnapshot = await snapshotChromeLocalStorage(
        page,
        ['mcpServers'],
        'MCP connector',
      )
      await seedLiveLocalMcpStorage(page)
      await page.send('Page.navigate', {
        url: `chrome-extension://${extensionId}/app.html#/home/chat`,
      })
      await sleep(2500)

      const uiSessionRestore = await verifyLiveLocalSessionUiRestore(
        page,
        extensionId,
      )

      const modeSwitchResult = await page.send<{
        result: {
          result: {
            value: Array<{
              label: string
              triggerText: string | null
              placeholder: string | null
            }>
          }
        }
      }>('Runtime.evaluate', {
        expression: `(async () => {
          const modes = ${JSON.stringify(requiredModeUi)};
          const wait = () => new Promise((resolve) => setTimeout(resolve, 75));
          const triggerLabels = new Set(modes.map((mode) => mode.label));
          const getTrigger = () => Array.from(document.querySelectorAll('button'))
            .find((candidate) => triggerLabels.has(candidate.innerText.trim()));
          const results = [];

          for (const mode of modes) {
            const trigger = getTrigger();
            if (!trigger) {
              results.push({ label: mode.label, triggerText: null, placeholder: null });
              continue;
            }

            trigger.click();
            await wait();

            const option = Array.from(document.querySelectorAll('button'))
              .find((candidate) =>
                candidate !== trigger &&
                candidate.innerText.includes(mode.label) &&
                candidate.innerText.includes(mode.description)
              );
            option?.click();
            await wait();

            const selectedTrigger = getTrigger();
            const textarea = document.querySelector('textarea');
            results.push({
              label: mode.label,
              triggerText: selectedTrigger?.innerText.trim() ?? null,
              placeholder: textarea?.getAttribute('placeholder') ?? null,
            });
          }

          return results;
        })()`,
        returnByValue: true,
        awaitPromise: true,
      })
      const modeSwitches = modeSwitchResult.result.result.value
      for (const mode of requiredModeUi) {
        const result = modeSwitches.find((entry) => entry.label === mode.label)
        assert(result, `Mode switch did not run for ${mode.label}`)
        assert(
          result.triggerText === mode.label,
          `Mode switch failed for ${mode.label}: ${result.triggerText}`,
        )
        assert(
          result.placeholder === mode.placeholder,
          `Mode placeholder failed for ${mode.label}: ${result.placeholder}`,
        )
      }
      await sleep(500)

      const domResult = await page.send<{
        result: { result: { value: { bodyText: string } } }
      }>('Runtime.evaluate', {
        expression: `(() => ({
          bodyText: document.body?.innerText ?? ''
        }))()`,
        returnByValue: true,
        awaitPromise: true,
      })
      const bodyText = domResult.result.result.value.bodyText

      assert(
        bodyText.includes('Agents & Skills'),
        'Main sidebar is missing the Agents & Skills entry',
      )

      const modeRequests = await verifyModeRequestBodies(page)
      verifyLocalProviderRequests(modeRequests, 'LLM sidepanel')
      verifyLocalConnectorRequests(modeRequests, 'LLM sidepanel')
      const agentModeRequests = await verifyAgentModeRequestBodies(
        page,
        tempAgent,
        extensionId,
      )
      verifyLocalConnectorRequests(agentModeRequests, 'Local agent sidepanel')
      await clearSidepanelAgentTargetSelection(page)

      const localRuntimeUi = await verifyLocalRuntimeCapabilitiesUi(
        page,
        extensionId,
      )
      const localApps = await verifyLocalAppsAndConnectorsUi(page, extensionId)

      const scheduledTasks = await verifyScheduledTaskModes(page, extensionId)
      const visibleBranding = await verifyVisiblePannamosBranding(
        page,
        extensionId,
      )

      const monitoredRequestUrls = [...page.requestUrls, ...worker.requestUrls]
      const cloudRequests = monitoredRequestUrls.filter((url) =>
        browserOsCloudPattern.test(url),
      )
      assert(
        cloudRequests.length === 0,
        `BrowserOS cloud requests detected: ${cloudRequests.join(', ')}`,
      )

      const nonLocalHosts = [
        ...new Set(monitoredRequestUrls.map(hostOf)),
      ].filter((host) => host && !isLocalHost(host, extensionId))
      assert(
        nonLocalHosts.length === 0,
        `Non-local requests detected during extension load: ${nonLocalHosts.join(', ')}`,
      )

      return {
        extensionId,
        uiSessionRestore,
        modeSwitches,
        modeRequests,
        agentModeRequests,
        localRuntimeUi,
        localApps,
        scheduledTasks,
        visibleBranding,
        tempAgentBootstrap,
        requestCount: monitoredRequestUrls.length,
        requestHosts: [...new Set(monitoredRequestUrls.map(hostOf))]
          .filter(Boolean)
          .sort(),
        serviceWorker: {
          requestCount: worker.requestUrls.length,
          requestHosts: [...new Set(worker.requestUrls.map(hostOf))]
            .filter(Boolean)
            .sort(),
        },
      }
    } finally {
      await clearSidepanelAgentTargetSelection(page).catch(() => undefined)
      if (mcpStorageSnapshot) {
        await restoreChromeLocalStorage(
          page,
          ['mcpServers'],
          mcpStorageSnapshot,
          'MCP connector',
        ).catch(() => undefined)
      }
      if (providerStorageSnapshot) {
        await restoreChromeLocalStorage(
          page,
          providerStorageKeys,
          providerStorageSnapshot,
          'local provider',
        ).catch(() => undefined)
      }
      page.close()
    }
  } finally {
    if (targetId) {
      await browser.send('Target.closeTarget', { targetId })
    }
    browser.close()
    worker.close()
    await deleteTempLocalAgent(tempAgent.id)
  }
}

try {
  const capabilities = await verifyCapabilities()
  const localSessions = await verifyLiveLocalSessions()
  const extension = await verifyExtensionUiAndNetwork()

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        cdpPort,
        serverPort,
        capabilities,
        localSessions,
        extension,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error('Live PannamOS local verification failed.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
