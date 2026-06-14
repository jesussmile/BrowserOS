import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { compact } from 'es-toolkit/array'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import useDeepCompareEffect from 'use-deep-compare-effect'
import type { Provider } from '@/components/chat/chatComponentTypes'
import type { ServerAttachmentPayload } from '@/lib/attachments'
import { Capabilities, Feature } from '@/lib/browseros/capabilities'
import { useAgentServerUrl } from '@/lib/browseros/useBrowserOSProviders'
import type { ChatAction } from '@/lib/chat-actions/types'
import {
  CONVERSATION_RESET_EVENT,
  GLOW_STOP_CLICKED_EVENT,
  MESSAGE_DISLIKE_EVENT,
  MESSAGE_LIKE_EVENT,
  MESSAGE_SENT_EVENT,
  PROVIDER_SELECTED_EVENT,
} from '@/lib/constants/analyticsEvents'
import {
  getConversationById,
  getLatestConversation,
  useConversations,
} from '@/lib/conversations/conversationStorage'
import { formatConversationHistory } from '@/lib/conversations/formatConversationHistory'
import { compactLocalServerConversation } from '@/lib/conversations/localSessionClient'
import { sanitizeConversationMessages } from '@/lib/conversations/messageSanitization'
import { useInvalidateCredits } from '@/lib/credits/useCredits'
import { declinedAppsStorage } from '@/lib/declined-apps/storage'
import {
  cancelGoalLoop,
  compactGoalLoop,
  type GoalLoopAction,
  type GoalLoopProgress,
  getGoalLoopProgress,
  pauseGoalLoop,
  planGoalLoop,
  resumeGoalLoopStatus,
  runGoalLoop,
} from '@/lib/goals/goalLoopClient'
import { createDefaultPannamOSProvider } from '@/lib/llm-providers/storage'
import type {
  ChatAgentStrategy,
  ChatRequestBrowserContext,
} from '@/lib/messaging/server/buildChatRequestBody'
import { track } from '@/lib/metrics/track'
import { searchActionsStorage } from '@/lib/search-actions/searchActionsStorage'
import { selectedTextStorage } from '@/lib/selected-text/selectedTextStorage'
import { sentry } from '@/lib/sentry/sentry'
import { stopAgentStorage } from '@/lib/stop-agent/stop-agent-storage'
import { selectedWorkspaceStorage } from '@/lib/workspace/workspace-storage'
import {
  type ChatMode,
  DEFAULT_CHAT_MODE,
  normalizeChatMode,
} from './chatTypes'
import { toLlmProviderConfig } from './sidepanel-chat-targets'
import { useChatRefs } from './useChatRefs'
import {
  createApprovalAutoSendPredicate,
  extractToolApprovalResponses,
  getOutgoingMessageText,
} from './useChatSessionApprovals'
import {
  buildSidepanelPreparedSendMessagesRequest,
  toProviderOption,
} from './useChatSessionRequest'
import { useExecutionHistoryTracker } from './useExecutionHistoryTracker'
import { useNotifyActiveTab } from './useNotifyActiveTab'
import {
  shouldRouteWorkspaceGoalToAgentChat,
  shouldSeedGoalLoopFromAttachedTabs,
} from './workspaceGoalRouting'

const getLastMessageText = (messages: UIMessage[]) => {
  const lastMessage = messages[messages.length - 1]
  if (!lastMessage) return ''
  return lastMessage.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

const getLastUserMessageText = (messages: UIMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      return getLastMessageText([messages[i]])
    }
  }
  return ''
}

const createTextMessage = (
  role: 'user' | 'assistant',
  text: string,
): UIMessage => ({
  id: crypto.randomUUID(),
  role,
  parts: [{ type: 'text', text }],
})

const inferGoalLoopAction = (text: string): GoalLoopAction => {
  if (/\b(download|save\s+pdf|pdf|file)\b/i.test(text)) return 'download'
  if (/\b(open|visit|go\s+to|navigate)\b/i.test(text)) return 'navigate'
  if (/\b(click|select|choose)\b/i.test(text)) return 'click'
  if (/\b(scroll)\b/i.test(text)) return 'scroll'
  if (/\b(extract|collect|scrape|read\s+data)\b/i.test(text)) return 'extract'
  if (/\b(verify|check|confirm)\b/i.test(text)) return 'verify'
  return 'read'
}

const isGoalLoopTerminal = (progress: GoalLoopProgress | null): boolean => {
  if (!progress) return false
  if (
    progress.status === 'completed' ||
    progress.status === 'cancelled' ||
    progress.status === 'blocked'
  ) {
    return true
  }
  return (
    progress.status === 'paused' &&
    progress.queueCounts.pending + progress.queueCounts.running === 0
  )
}

const delay = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

const formatGoalLoopSummary = (progress: GoalLoopProgress | null): string => {
  if (!progress) return 'Goal Loop finished, but progress could not be loaded.'

  const counts = progress.queueCounts
  const totals = progress.manifest?.totals
  const outputPaths =
    progress.manifest?.completed
      .map((item) => item.artifactPath)
      .filter((path): path is string => Boolean(path)) ?? []

  if (progress.status === 'cancelled') {
    return `Goal Loop cancelled. Completed ${counts.completed}, pending ${counts.pending}.`
  }

  if (progress.pauseReason) {
    return `Goal Loop paused: ${progress.pauseReason}`
  }

  if (totals) {
    const outputLine = outputPaths.length
      ? `\n\nOutputs:\n${outputPaths.map((path) => `- ${path}`).join('\n')}`
      : ''
    return (
      [
        'Goal Loop complete.',
        `Completed: ${totals.completed}`,
        `Skipped: ${totals.skipped}`,
        `Failed: ${totals.failed}`,
        `Blocked: ${totals.blocked}`,
        `Pending: ${totals.pending}`,
      ].join('\n') + outputLine
    )
  }

  return `Goal Loop status: ${progress.status}. Completed ${counts.completed}, pending ${counts.pending}.`
}

export const getResponseAndQueryFromMessageId = (
  messages: UIMessage[],
  messageId: string,
) => {
  const messageIndex = messages.findIndex((each) => each.id === messageId)
  const response = messages?.[messageIndex] ?? []
  const query = messages?.[messageIndex - 1] ?? []
  const responseText = response.parts
    .filter((each) => each.type === 'text')
    .map((each) => each.text)
    .join('\n\n')
  const queryText = query.parts
    .filter((each) => each.type === 'text')
    .map((each) => each.text)
    .join('\n')

  return {
    responseText,
    queryText,
  }
}

export type ChatOrigin = 'sidepanel' | 'newtab'

export interface ChatSessionOptions {
  origin?: ChatOrigin
  /** When false, messages are queued until integrations finish syncing. */
  isIntegrationsSynced?: boolean
}

const NEWTAB_SYSTEM_PROMPT = `IMPORTANT: The user is chatting from the New Tab page. When performing browser actions, ALWAYS open content in a NEW TAB rather than navigating the current tab. The user's new tab page should remain accessible.`

const getUserSystemPrompt = (
  origin: ChatOrigin | undefined,
  personalization: string,
) =>
  origin === 'newtab'
    ? [personalization, NEWTAB_SYSTEM_PROMPT].filter(Boolean).join('\n\n')
    : personalization

const buildRequestBrowserContext = ({
  activeTab,
  action,
  enabledMcpServers,
  customMcpServers,
}: {
  activeTab?: chrome.tabs.Tab
  action?: ChatAction
  enabledMcpServers: Array<string | undefined>
  customMcpServers: {
    name: string
    url?: string
  }[]
}): ChatRequestBrowserContext | undefined => {
  const browserContext: ChatRequestBrowserContext = {}

  if (activeTab) {
    browserContext.windowId = activeTab.windowId
    browserContext.activeTab = {
      id: activeTab.id,
      url: activeTab.url,
      title: activeTab.title,
    }
  }

  if (action?.tabs?.length) {
    browserContext.selectedTabs = action.tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
    }))
  }

  const managedMcpServers = compact(enabledMcpServers)
  if (managedMcpServers.length) {
    browserContext.enabledMcpServers = managedMcpServers
  }

  if (customMcpServers.length) {
    browserContext.customMcpServers = customMcpServers
  }

  return Object.keys(browserContext).length ? browserContext : undefined
}

export const useChatSession = (options?: ChatSessionOptions) => {
  const {
    selectedLlmProviderRef,
    selectedChatTargetRef,
    enabledMcpServersRef,
    enabledCustomServersRef,
    personalizationRef,
    setDefaultProvider,
    chatTargets,
    selectedChatTarget,
    selectChatTarget,
    selectedLlmProvider,
    isLoadingProviders,
  } = useChatRefs()
  const invalidateCredits = useInvalidateCredits()

  const {
    baseUrl: agentServerUrl,
    isLoading: isLoadingAgentUrl,
    error: agentUrlError,
  } = useAgentServerUrl()

  const { saveConversation: saveLocalConversation } = useConversations()
  const [searchParams, setSearchParams] = useSearchParams()
  const conversationIdParam = searchParams.get('conversationId')

  const agentUrlRef = useRef(agentServerUrl)

  useEffect(() => {
    agentUrlRef.current = agentServerUrl
  }, [agentServerUrl])

  const providers: Provider[] = chatTargets.map(toProviderOption)

  const [mode, setModeState] = useState<ChatMode>(DEFAULT_CHAT_MODE)
  const modeRef = useRef<ChatMode>(DEFAULT_CHAT_MODE)
  const setMode = useCallback((nextMode: ChatMode) => {
    modeRef.current = nextMode
    setModeState(nextMode)
  }, [])
  const [textToAction, setTextToAction] = useState<Map<string, ChatAction>>(
    new Map(),
  )
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [disliked, setDisliked] = useState<Record<string, boolean>>({})
  const [conversationId, setConversationId] = useState(crypto.randomUUID())
  const [goalLoopProgress, setGoalLoopProgress] =
    useState<GoalLoopProgress | null>(null)
  const [goalLoopStatus, setGoalLoopStatus] = useState<
    'streaming' | 'submitted' | 'ready' | 'error'
  >('ready')
  const [activeGoalLoopId, setActiveGoalLoopId] = useState<string | null>(null)
  const [initialChatMessages, setInitialChatMessages] = useState<
    UIMessage[] | undefined
  >(undefined)
  const conversationIdRef = useRef(conversationId)
  const activeGoalLoopIdRef = useRef<string | null>(null)
  const goalLoopStopRequestedRef = useRef(false)
  const skipLatestRestoreRef = useRef(searchParams.has('q'))
  const restoredLatestConversationRef = useRef(false)
  const [isRestoringLatestConversation, setIsRestoringLatestConversation] =
    useState(false)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  const {
    startTask: startExecutionTask,
    syncFromMessages: syncExecutionHistory,
    finishTask: finishExecutionTask,
  } = useExecutionHistoryTracker()

  const onClickLike = (messageId: string) => {
    const { responseText, queryText } = getResponseAndQueryFromMessageId(
      messages,
      messageId,
    )

    track(MESSAGE_LIKE_EVENT, { responseText, queryText, messageId })

    setLiked((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  const onClickDislike = (messageId: string, comment?: string) => {
    const { responseText, queryText } = getResponseAndQueryFromMessageId(
      messages,
      messageId,
    )

    track(MESSAGE_DISLIKE_EVENT, {
      responseText,
      queryText,
      messageId,
      comment,
    })

    setDisliked((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  const textToActionRef = useRef<Map<string, ChatAction>>(textToAction)
  const workingDirRef = useRef<string | undefined>(undefined)
  const selectionMapRef = useRef<
    Record<string, { text: string; url: string; title: string }>
  >({})
  const pendingSelectionTabKeyRef = useRef<string | null>(null)
  const messagesRef = useRef<UIMessage[]>([])
  const pendingRequestAttachmentsRef = useRef<ServerAttachmentPayload[]>([])
  const pendingRequestAgentStrategyRef = useRef<ChatAgentStrategy | undefined>(
    undefined,
  )

  useEffect(() => {
    const toRef = (
      map: Record<string, { text: string; pageUrl: string; pageTitle: string }>,
    ) => {
      const result: Record<
        string,
        { text: string; url: string; title: string }
      > = {}
      for (const [k, v] of Object.entries(map)) {
        result[k] = { text: v.text, url: v.pageUrl, title: v.pageTitle }
      }
      return result
    }
    selectedTextStorage.getValue().then((map) => {
      selectionMapRef.current = toRef(map)
    })
    const unwatchText = selectedTextStorage.watch((map) => {
      selectionMapRef.current = toRef(map)
    })
    return () => unwatchText()
  }, [])

  useEffect(() => {
    selectedWorkspaceStorage.getValue().then((folder) => {
      workingDirRef.current = folder?.path
    })

    const unwatch = selectedWorkspaceStorage.watch((folder) => {
      workingDirRef.current = folder?.path
    })
    return () => unwatch()
  }, [])

  useDeepCompareEffect(() => {
    modeRef.current = mode
    textToActionRef.current = textToAction
  }, [mode, textToAction])

  const selectedProvider = selectedChatTarget
    ? toProviderOption(selectedChatTarget)
    : providers[0]
  const sendApprovalResponsesAutomaticallyRef = useRef(
    createApprovalAutoSendPredicate(),
  )

  const {
    messages,
    sendMessage: baseSendMessage,
    setMessages,
    status,
    stop,
    error: chatError,
    addToolApprovalResponse,
  } = useChat({
    id: conversationId,
    messages: initialChatMessages,
    transport: new DefaultChatTransport({
      prepareSendMessagesRequest: async ({ messages }) => {
        const target = selectedChatTargetRef.current
        const fallbackProvider =
          selectedLlmProviderRef.current ?? createDefaultPannamOSProvider()
        const activeTabsList = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        })
        const activeTab = activeTabsList?.[0] ?? undefined
        const activeTabSelection = activeTab?.id
          ? (selectionMapRef.current[String(activeTab.id)] ?? null)
          : null
        const currentMode = modeRef.current
        const enabledMcpServers = enabledMcpServersRef.current
        const customMcpServers = enabledCustomServersRef.current
        const lastUserMessage = getLastUserMessageText(messages)
        const action = textToActionRef.current.get(lastUserMessage)
        const requestBrowserContext = buildRequestBrowserContext({
          activeTab,
          action,
          enabledMcpServers,
          customMcpServers,
        })

        const declinedApps = await declinedAppsStorage.getValue()
        const supportsArrayConversation = await Capabilities.supports(
          Feature.PREVIOUS_CONVERSATION_ARRAY,
        )

        const previousMessages = messagesRef.current
        const history =
          previousMessages.length > 0
            ? formatConversationHistory(previousMessages)
            : undefined
        const previousConversation = history?.length
          ? supportsArrayConversation
            ? history
            : history.map((m) => `${m.role}: ${m.content}`).join('\n')
          : undefined

        const userSystemPrompt = getUserSystemPrompt(
          options?.origin,
          personalizationRef.current,
        )

        const selectedWorkspace = await selectedWorkspaceStorage.getValue()
        const workingDir = selectedWorkspace?.path ?? workingDirRef.current
        workingDirRef.current = workingDir

        const commonRequest = {
          conversationId: conversationIdRef.current,
          mode: currentMode,
          browserContext: requestBrowserContext,
          userSystemPrompt,
          userWorkingDir: workingDir,
          previousConversation,
          declinedApps,
        }

        const message = getOutgoingMessageText(messages)
        const approvalResponses = extractToolApprovalResponses(messages)
        const hasApprovalResponses = (approvalResponses?.length ?? 0) > 0
        const attachments = hasApprovalResponses
          ? undefined
          : pendingRequestAttachmentsRef.current
        const agentStrategy = hasApprovalResponses
          ? undefined
          : pendingRequestAgentStrategyRef.current
        pendingRequestAttachmentsRef.current = []
        pendingRequestAgentStrategyRef.current = undefined

        const isFullAccessMode =
          currentMode === 'goal' || currentMode === 'agent'

        const result = buildSidepanelPreparedSendMessagesRequest({
          agentServerUrl: agentUrlRef.current ?? undefined,
          target,
          fallbackProvider,
          message,
          approvalResponses,
          attachments,
          approvalPolicy: isFullAccessMode
            ? { mode: 'full_browser', scope: 'goal_run' }
            : undefined,
          agentStrategy: isFullAccessMode
            ? (agentStrategy ?? { mode: 'auto', maxWorkers: 3 })
            : undefined,
          ...commonRequest,
          selectedText: activeTabSelection?.text,
          selectedTextSource: activeTabSelection
            ? {
                url: activeTabSelection.url,
                title: activeTabSelection.title,
              }
            : undefined,
        })

        // Track which tab's selection was sent so we can clear it on success
        pendingSelectionTabKeyRef.current =
          activeTabSelection && activeTab?.id ? String(activeTab.id) : null

        return result
      },
    }),
    sendAutomaticallyWhen: sendApprovalResponsesAutomaticallyRef.current,
    onFinish: async ({ message, isAbort, isError }) => {
      await finishExecutionTask({
        responseText: getLastMessageText([message]),
        isAbort,
        isError,
      })
    },
  })

  // Remove messages with empty parts (e.g. interrupted assistant responses)
  // and strip bulky tool payloads that the UI never renders.
  useEffect(() => {
    const hasEmptyMessages =
      status !== 'streaming' && messages.some((m) => !m.parts?.length)
    const withoutEmpty = hasEmptyMessages
      ? messages.filter((m) => m.parts?.length > 0)
      : messages
    const sanitized = sanitizeConversationMessages(withoutEmpty)
    if (sanitized !== messages) {
      messagesRef.current = sanitized
      setMessages(sanitized)
    }
  }, [messages, status, setMessages])

  useNotifyActiveTab({
    messages,
    status,
    conversationId: conversationIdRef.current,
    goalLoopProgress,
  })

  const [restoredConversationId, setRestoredConversationId] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (!conversationIdParam) return
    if (restoredConversationId === conversationIdParam) return

    const restoreLocal = async () => {
      const conversation = await getConversationById(conversationIdParam)

      if (conversation) {
        const restoredMessages = sanitizeConversationMessages(
          conversation.messages.filter((m) => m.parts?.length > 0),
        )
        setConversationId(
          conversation.id as ReturnType<typeof crypto.randomUUID>,
        )
        setInitialChatMessages(restoredMessages)
        messagesRef.current = restoredMessages
        setMessages(restoredMessages)
      }
      setRestoredConversationId(conversationIdParam)
      setSearchParams({}, { replace: true })
    }
    restoreLocal()
  }, [
    conversationIdParam,
    restoredConversationId,
    setMessages,
    setSearchParams,
  ])

  useEffect(() => {
    if (
      conversationIdParam ||
      skipLatestRestoreRef.current ||
      restoredLatestConversationRef.current ||
      messagesRef.current.length > 0
    ) {
      return
    }

    let cancelled = false
    setIsRestoringLatestConversation(true)

    getLatestConversation()
      .then((latestConversation) => {
        if (cancelled) return
        restoredLatestConversationRef.current = true
        if (!latestConversation) return

        const restoredMessages = sanitizeConversationMessages(
          latestConversation.messages.filter((m) => m.parts?.length > 0),
        )
        setConversationId(
          latestConversation.id as ReturnType<typeof crypto.randomUUID>,
        )
        setInitialChatMessages(restoredMessages)
        messagesRef.current = restoredMessages
        setMessages(restoredMessages)
      })
      .finally(() => {
        if (!cancelled) setIsRestoringLatestConversation(false)
      })

    return () => {
      cancelled = true
    }
  }, [conversationIdParam, setMessages])

  // Keep messagesRef in sync on every change (cheap ref assignment)
  useEffect(() => {
    const sanitized = sanitizeConversationMessages(messages)
    messagesRef.current = sanitized
    syncExecutionHistory(sanitized, status)
  }, [messages, status, syncExecutionHistory])

  // Save conversation only after streaming completes — not on every token
  const previousStatusRef = useRef(status)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only save when streaming finishes
  useEffect(() => {
    const wasStreaming =
      previousStatusRef.current === 'streaming' ||
      previousStatusRef.current === 'submitted'
    const justFinished = wasStreaming && status === 'ready'
    previousStatusRef.current = status

    if (!justFinished) return

    // Clear the selected text that was sent with this request
    const tabKey = pendingSelectionTabKeyRef.current
    if (tabKey) {
      pendingSelectionTabKeyRef.current = null
      delete selectionMapRef.current[tabKey]
      selectedTextStorage.getValue().then((map) => {
        if (map[tabKey]) {
          const { [tabKey]: _, ...rest } = map
          selectedTextStorage.setValue(rest)
        }
      })
    }

    const messagesToSave = sanitizeConversationMessages(
      messagesRef.current.filter((m) => m.parts?.length > 0),
    )
    if (messagesToSave.length === 0) return

    // Private fork default: completed chats are persisted locally through the
    // PannamOS server SQLite store, with extension storage as fallback.
    saveLocalConversation(conversationIdRef.current, messagesToSave)

    invalidateCredits()
  }, [status])

  useEffect(() => {
    if (chatError) invalidateCredits()
  }, [chatError, invalidateCredits])

  const isIntegrationsSynced = options?.isIntegrationsSynced ?? true
  const isIntegrationsSyncedRef = useRef(isIntegrationsSynced)
  const pendingMessageRef = useRef<{
    text: string
    action?: ChatAction
    attachments?: ServerAttachmentPayload[]
    agentStrategy?: ChatAgentStrategy
  } | null>(null)

  const dispatchMessage = useCallback(
    (
      text: string,
      attachments: ServerAttachmentPayload[] = [],
      agentStrategy?: ChatAgentStrategy,
    ) => {
      startExecutionTask({
        conversationId: conversationIdRef.current,
        promptText: text,
      })
      pendingRequestAttachmentsRef.current = attachments
      pendingRequestAgentStrategyRef.current = agentStrategy
      baseSendMessage({ text })
    },
    [baseSendMessage, startExecutionTask],
  )

  const persistGoalLoopMessages = useCallback(
    (nextMessages: UIMessage[]) => {
      const sanitizedMessages = sanitizeConversationMessages(nextMessages)
      messagesRef.current = sanitizedMessages
      setMessages(sanitizedMessages)
      saveLocalConversation(conversationIdRef.current, sanitizedMessages)
    },
    [saveLocalConversation, setMessages],
  )

  const appendGoalLoopMessage = useCallback(
    (role: 'user' | 'assistant', text: string) => {
      const nextMessages = [
        ...messagesRef.current.filter((message) => message.parts?.length > 0),
        createTextMessage(role, text),
      ]
      persistGoalLoopMessages(nextMessages)
      return nextMessages
    },
    [persistGoalLoopMessages],
  )

  const buildGoalLoopQueueItems = useCallback(
    (text: string, action?: ChatAction) => {
      if (!shouldSeedGoalLoopFromAttachedTabs(text, action)) return undefined
      if (!action?.tabs?.length) return undefined
      const goalAction = inferGoalLoopAction(text)
      return action.tabs
        .filter((tab) => tab.url?.startsWith('http'))
        .map((tab) => ({
          title: `${goalAction === 'download' ? 'Download' : 'Read'} ${tab.title ?? tab.url}`,
          sourceUrl: tab.url,
          metadata: {
            action: goalAction,
            risk: 'low' as const,
            url: tab.url,
          },
        }))
    },
    [],
  )

  const runGoalLoopUntilSettled = useCallback(
    async (goalId: string): Promise<GoalLoopProgress | null> => {
      setGoalLoopStatus('streaming')

      let latestProgress = await getGoalLoopProgress(goalId)
      if (latestProgress) setGoalLoopProgress(latestProgress)

      const startedRun = await runGoalLoop(goalId, {
        resumeReason: 'ui_auto_continue',
        background: true,
      })

      if (!startedRun) {
        latestProgress = await getGoalLoopProgress(goalId)
        if (latestProgress) setGoalLoopProgress(latestProgress)
        if (!latestProgress) throw new Error('Goal Loop run failed to start.')
        return latestProgress
      }

      while (!goalLoopStopRequestedRef.current) {
        await delay(1500)
        latestProgress = await getGoalLoopProgress(goalId)
        if (latestProgress) setGoalLoopProgress(latestProgress)
        if (isGoalLoopTerminal(latestProgress)) break
      }

      latestProgress = await getGoalLoopProgress(goalId)
      if (latestProgress) setGoalLoopProgress(latestProgress)
      return latestProgress
    },
    [],
  )

  const dispatchGoalLoopMessage = useCallback(
    async (params: {
      text: string
      action?: ChatAction
      attachments?: ServerAttachmentPayload[]
      agentStrategy?: ChatAgentStrategy
    }) => {
      let workingDir = workingDirRef.current
      try {
        const selectedWorkspace = await selectedWorkspaceStorage.getValue()
        workingDir = selectedWorkspace?.path
        workingDirRef.current = workingDir
      } catch {
        // Keep the last known workspace ref if extension storage is unavailable.
      }

      if (
        shouldRouteWorkspaceGoalToAgentChat(
          params.text,
          workingDir,
          params.action,
        )
      ) {
        goalLoopStopRequestedRef.current = true
        activeGoalLoopIdRef.current = null
        setActiveGoalLoopId(null)
        setGoalLoopProgress(null)
        setGoalLoopStatus('ready')
        dispatchMessage(params.text, params.attachments, params.agentStrategy)
        return
      }

      goalLoopStopRequestedRef.current = false
      setGoalLoopStatus('submitted')
      setGoalLoopProgress(null)
      startExecutionTask({
        conversationId: conversationIdRef.current,
        promptText: params.text,
      })
      appendGoalLoopMessage('user', params.text)

      try {
        const goal = await planGoalLoop({
          sessionId: conversationIdRef.current,
          prompt: params.text,
          approvalPolicy: { mode: 'full_browser', scope: 'goal_run' },
          agentStrategy: params.agentStrategy ?? {
            mode: 'auto',
            maxWorkers: 3,
          },
          queueItems: buildGoalLoopQueueItems(params.text, params.action),
        })
        if (!goal) throw new Error('Goal Loop could not be planned locally.')

        activeGoalLoopIdRef.current = goal.id
        setActiveGoalLoopId(goal.id)

        const finalProgress = await runGoalLoopUntilSettled(goal.id)
        const responseText = formatGoalLoopSummary(finalProgress)
        appendGoalLoopMessage('assistant', responseText)
        await finishExecutionTask({
          responseText,
          isAbort: finalProgress?.status === 'cancelled',
          isError:
            !finalProgress ||
            finalProgress.queueCounts.failed > 0 ||
            finalProgress.status === 'blocked',
        })
        setGoalLoopStatus('ready')
      } catch (error) {
        const responseText =
          error instanceof Error ? error.message : String(error)
        appendGoalLoopMessage('assistant', responseText)
        await finishExecutionTask({ responseText, isError: true })
        setGoalLoopStatus('error')
      }
    },
    [
      appendGoalLoopMessage,
      buildGoalLoopQueueItems,
      dispatchMessage,
      finishExecutionTask,
      runGoalLoopUntilSettled,
      startExecutionTask,
    ],
  )

  useEffect(() => {
    isIntegrationsSyncedRef.current = isIntegrationsSynced
  }, [isIntegrationsSynced])

  // Flush pending message when integrations sync completes
  useEffect(() => {
    if (isIntegrationsSynced && pendingMessageRef.current) {
      const pending = pendingMessageRef.current
      pendingMessageRef.current = null
      if (modeRef.current === 'goal') {
        void dispatchGoalLoopMessage(pending)
        return
      }
      if (pending.action) {
        setTextToAction((prev) => {
          const next = new Map(prev)
          // biome-ignore lint/style/noNonNullAssertion: guarded by if (pending.action) above
          next.set(pending.text, pending.action!)
          return next
        })
      }
      dispatchMessage(pending.text, pending.attachments, pending.agentStrategy)
    }
  }, [dispatchGoalLoopMessage, dispatchMessage, isIntegrationsSynced])

  const sendMessage = (params: {
    text: string
    action?: ChatAction
    attachments?: ServerAttachmentPayload[]
    agentStrategy?: ChatAgentStrategy
  }) => {
    const target = selectedChatTargetRef.current
    const llmTargetProvider = toLlmProviderConfig(target)
    const agentTarget = target?.kind === 'acp' ? target : undefined
    track(MESSAGE_SENT_EVENT, {
      mode,
      provider_id:
        agentTarget?.agentId ??
        llmTargetProvider?.id ??
        selectedLlmProvider?.id,
      provider_type: agentTarget ? 'acp' : llmTargetProvider?.type,
      agent_id: agentTarget?.agentId,
      adapter: agentTarget?.adapter,
      model:
        agentTarget?.modelId ??
        llmTargetProvider?.modelId ??
        selectedLlmProvider?.modelId,
    })

    if (!isIntegrationsSyncedRef.current) {
      // Queue the message — will be sent when sync completes
      pendingMessageRef.current = params
      return
    }

    if (modeRef.current === 'goal') {
      void dispatchGoalLoopMessage(params)
      return
    }

    if (params.action) {
      const action = params.action
      setTextToAction((prev) => {
        const next = new Map(prev)
        next.set(params.text, action)
        return next
      })
    }
    dispatchMessage(params.text, params.attachments, params.agentStrategy)
  }

  const compactConversation = useCallback(async () => {
    if (activeGoalLoopIdRef.current) {
      const compacted = await compactGoalLoop(activeGoalLoopIdRef.current, {
        reason: 'manual_resume',
      })
      if (compacted?.progress) {
        setGoalLoopProgress(compacted.progress)
      } else {
        const progress = await getGoalLoopProgress(activeGoalLoopIdRef.current)
        if (progress) setGoalLoopProgress(progress)
      }
      appendGoalLoopMessage('assistant', 'Goal Loop compacted locally.')
      return
    }

    const compaction = await compactLocalServerConversation(
      conversationIdRef.current,
    )
    const responseText = compaction
      ? `Conversation compacted locally. ${compaction.retainedRecentCount} recent messages retained in the compact packet.`
      : 'Conversation compact failed. The local server did not return a compact packet.'
    const nextMessages = [
      ...messagesRef.current.filter((message) => message.parts?.length > 0),
      createTextMessage('assistant', responseText),
    ]
    persistGoalLoopMessages(nextMessages)
  }, [appendGoalLoopMessage, persistGoalLoopMessages])

  const pauseActiveGoalLoop = useCallback(async () => {
    const goalId = activeGoalLoopIdRef.current
    if (!goalId) return
    goalLoopStopRequestedRef.current = true
    await pauseGoalLoop(goalId)
    const progress = await getGoalLoopProgress(goalId)
    if (progress) setGoalLoopProgress(progress)
    setGoalLoopStatus('ready')
  }, [])

  const resumeActiveGoalLoop = useCallback(async () => {
    const goalId = activeGoalLoopIdRef.current
    if (!goalId) return
    goalLoopStopRequestedRef.current = false
    setGoalLoopStatus('submitted')
    await resumeGoalLoopStatus(goalId)
    const resumedProgress = await getGoalLoopProgress(goalId)
    if (resumedProgress) setGoalLoopProgress(resumedProgress)
    try {
      const finalProgress = await runGoalLoopUntilSettled(goalId)
      const responseText = formatGoalLoopSummary(finalProgress)
      appendGoalLoopMessage('assistant', responseText)
      await finishExecutionTask({
        responseText,
        isAbort: finalProgress?.status === 'cancelled',
        isError:
          !finalProgress ||
          finalProgress.queueCounts.failed > 0 ||
          finalProgress.status === 'blocked',
      })
      setGoalLoopStatus('ready')
    } catch (error) {
      const responseText =
        error instanceof Error ? error.message : String(error)
      appendGoalLoopMessage('assistant', responseText)
      await finishExecutionTask({ responseText, isError: true })
      setGoalLoopStatus('error')
    }
  }, [appendGoalLoopMessage, finishExecutionTask, runGoalLoopUntilSettled])

  const cancelActiveGoalLoop = useCallback(async () => {
    const goalId = activeGoalLoopIdRef.current
    if (!goalId) {
      stop()
      return
    }
    goalLoopStopRequestedRef.current = true
    await cancelGoalLoop(goalId)
    const progress = await getGoalLoopProgress(goalId)
    if (progress) setGoalLoopProgress(progress)
    setGoalLoopStatus('ready')
    await finishExecutionTask({ isAbort: true })
  }, [finishExecutionTask, stop])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only need to run this once
  useEffect(() => {
    const unwatch = searchActionsStorage.watch((storageAction) => {
      if (storageAction) {
        const nextMode = normalizeChatMode(storageAction.mode)
        modeRef.current = nextMode
        setMode(nextMode)
        sendMessage({ text: storageAction.query, action: storageAction.action })
      }
    })
    return () => unwatch()
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: only need to run this once
  useEffect(() => {
    const unwatch = stopAgentStorage.watch((signal) => {
      if (signal && signal.conversationId === conversationIdRef.current) {
        stop()
        track(GLOW_STOP_CLICKED_EVENT)
        stopAgentStorage.setValue(null)
      }
    })
    return () => unwatch()
  }, [])

  const resetConversationState = () => {
    stop()
    void finishExecutionTask({ isAbort: true })
    setInitialChatMessages(undefined)
    setConversationId(crypto.randomUUID())
    setMessages([])
    setTextToAction(new Map())
    setGoalLoopProgress(null)
    setActiveGoalLoopId(null)
    activeGoalLoopIdRef.current = null
    goalLoopStopRequestedRef.current = true
    setGoalLoopStatus('ready')
    setLiked({})
    setDisliked({})
    setRestoredConversationId(null)
  }

  const handleSelectProvider = (provider: Provider) => {
    const target = chatTargets.find(
      (candidate) =>
        candidate.id === provider.id && candidate.kind === provider.kind,
    )
    if (!target) return

    const previousTarget = selectedChatTargetRef.current
    track(PROVIDER_SELECTED_EVENT, {
      provider_id: target.id,
      provider_type: target.kind === 'acp' ? 'acp' : target.type,
      model_id:
        target.kind === 'acp' ? target.modelId : target.provider.modelId,
      agent_id: target.kind === 'acp' ? target.agentId : undefined,
      adapter: target.kind === 'acp' ? target.adapter : undefined,
    })

    void selectChatTarget(target).catch((error) => {
      sentry.captureException(error, {
        extra: {
          message: 'Failed to persist sidepanel chat target selection',
          targetId: target.id,
          targetKind: target.kind,
        },
      })
    })
    if (target.kind === 'llm') setDefaultProvider(target.provider.id)

    if (
      previousTarget &&
      (previousTarget.kind !== target.kind ||
        previousTarget.id !== target.id) &&
      messagesRef.current.length > 0
    ) {
      resetConversationState()
    }
  }

  const getActionForMessage = (message: UIMessage) => {
    if (message.role !== 'user') return undefined
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    return textToAction.get(text)
  }

  const resetConversation = () => {
    track(CONVERSATION_RESET_EVENT, { message_count: messages.length })
    resetConversationState()
  }

  const isRestoringConversation =
    (!!conversationIdParam && restoredConversationId !== conversationIdParam) ||
    isRestoringLatestConversation
  const effectiveStatus = goalLoopStatus !== 'ready' ? goalLoopStatus : status
  const effectiveStop = goalLoopStatus !== 'ready' ? cancelActiveGoalLoop : stop

  return {
    mode,
    setMode,
    messages,
    sendMessage,
    status: effectiveStatus,
    stop: effectiveStop,
    providers,
    selectedProvider,
    isLoading: isLoadingProviders || isLoadingAgentUrl,
    isSyncing: !isIntegrationsSynced,
    isRestoringConversation,
    agentUrlError,
    chatError,
    handleSelectProvider,
    getActionForMessage,
    resetConversation,
    liked,
    onClickLike,
    disliked,
    onClickDislike,
    addToolApprovalResponse,
    conversationId,
    goalLoopProgress,
    activeGoalLoopId,
    pauseGoalLoop: pauseActiveGoalLoop,
    resumeGoalLoop: resumeActiveGoalLoop,
    cancelGoalLoop: cancelActiveGoalLoop,
    compactConversation,
  }
}
