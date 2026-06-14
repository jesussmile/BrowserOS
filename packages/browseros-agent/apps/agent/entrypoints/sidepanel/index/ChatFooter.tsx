import {
  ChevronDown,
  Folder,
  Layers,
  Pause,
  Play,
  PlugZap,
  ShieldCheck,
  X,
} from 'lucide-react'
import type { FC, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AppSelector } from '@/components/elements/AppSelector'
import { WorkspaceSelector } from '@/components/elements/workspace-selector'
import { McpServerIcon } from '@/entrypoints/app/connect-mcp/McpServerIcon'
import { useGetUserMCPIntegrations } from '@/entrypoints/app/connect-mcp/useGetUserMCPIntegrations'
import type { StagedAttachment } from '@/lib/attachments'
import { Feature } from '@/lib/browseros/capabilities'
import { useCapabilities } from '@/lib/browseros/useCapabilities'
import type { GoalLoopProgress } from '@/lib/goals/goalLoopClient'
import { isLiveMcpServer, useMcpServers } from '@/lib/mcp/mcpServerStorage'
import type { ChatAgentStrategy } from '@/lib/messaging/server/buildChatRequestBody'
import {
  type SelectedTextData,
  selectedTextStorage,
} from '@/lib/selected-text/selectedTextStorage'
import { cn } from '@/lib/utils'
import type { VoiceInputState } from '@/lib/voice/useVoiceInput'
import { useWorkspace } from '@/lib/workspace/use-workspace'
import { ChatAttachedTabs } from './ChatAttachedTabs'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { ChatModeToggle } from './ChatModeToggle'
import { ChatSelectedText } from './ChatSelectedText'
import type { ChatMode } from './chatTypes'
import { GOAL_AGENT_STRATEGY_OPTIONS } from './goalAgentStrategy'
import {
  getGoalLoopProgressChips,
  getGoalLoopResumePrompt,
  getGoalLoopResumePromptPreview,
} from './goalLoopProgressDetails'

interface ChatFooterProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  onStop: () => void
  attachedTabs: chrome.tabs.Tab[]
  onToggleTab: (tab: chrome.tabs.Tab) => void
  onRemoveTab: (tabId?: number) => void
  voice?: VoiceInputState
  attachments: StagedAttachment[]
  onAttachmentsChange: (attachments: StagedAttachment[]) => void
  attachmentsEnabled?: boolean
  onCompactConversation?: () => void | Promise<void>
  agentStrategyMode: ChatAgentStrategy['mode']
  onAgentStrategyModeChange: (mode: ChatAgentStrategy['mode']) => void
  goalLoopProgress?: GoalLoopProgress | null
  activeGoalLoopId?: string | null
  onPauseGoalLoop?: () => void | Promise<void>
  onResumeGoalLoop?: () => void | Promise<void>
  onCancelGoalLoop?: () => void | Promise<void>
}

export const ChatFooter: FC<ChatFooterProps> = ({
  mode,
  onModeChange,
  input,
  onInputChange,
  onSubmit,
  status,
  onStop,
  attachedTabs,
  onToggleTab,
  onRemoveTab,
  voice,
  attachments,
  onAttachmentsChange,
  attachmentsEnabled = true,
  onCompactConversation,
  agentStrategyMode,
  onAgentStrategyModeChange,
  goalLoopProgress,
  activeGoalLoopId,
  onPauseGoalLoop,
  onResumeGoalLoop,
  onCancelGoalLoop,
}) => {
  const { selectedFolder } = useWorkspace()
  const { supports } = useCapabilities()
  const { servers: mcpServers } = useMcpServers()
  const { data: userMCPIntegrations } = useGetUserMCPIntegrations()
  const chatInputRef = useRef<ChatInputHandle>(null)
  const [selectionMap, setSelectionMap] = useState<
    Record<string, SelectedTextData>
  >({})
  const [activeTabId, setActiveTabId] = useState<number | undefined>()

  // Track active tab for tab-scoped selection display
  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => setActiveTabId(tabs[0]?.id))
    const listener = (activeInfo: { tabId: number }) => {
      setActiveTabId(activeInfo.tabId)
    }
    chrome.tabs.onActivated.addListener(listener)
    return () => chrome.tabs.onActivated.removeListener(listener)
  }, [])

  // Watch selected text storage (per-tab map)
  useEffect(() => {
    selectedTextStorage.getValue().then(setSelectionMap)
    const unwatch = selectedTextStorage.watch(setSelectionMap)
    return () => unwatch()
  }, [])

  const visibleSelectedText = activeTabId
    ? (selectionMap[String(activeTabId)] ?? null)
    : null
  const [isTabMentionOpen, setIsTabMentionOpen] = useState(false)

  useEffect(() => {
    const focusInput = () => {
      const active = document.activeElement
      const isInteractiveElementFocused =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLButtonElement
      if (!isInteractiveElementFocused) {
        chatInputRef.current?.focus()
      }
    }

    if (document.hasFocus()) {
      focusInput()
    }

    window.addEventListener('focus', focusInput)
    return () => window.removeEventListener('focus', focusInput)
  }, [])

  const connectedManagedServers = mcpServers.filter((s) => {
    if (s.type !== 'managed' || !s.managedServerName) return false
    if (isLiveMcpServer(s)) return true
    return userMCPIntegrations?.integrations?.find(
      (i) => i.name === s.managedServerName,
    )?.is_authenticated
  })
  const goalLoopLifecycle =
    goalLoopProgress?.lifecycleStatus ??
    (goalLoopProgress?.status === 'completed'
      ? 'complete'
      : goalLoopProgress?.status)
  const goalLoopProgressChips = goalLoopProgress
    ? getGoalLoopProgressChips(goalLoopProgress)
    : []
  const goalLoopResumePrompt = goalLoopProgress
    ? getGoalLoopResumePrompt(goalLoopProgress)
    : null
  const goalLoopResumePromptPreview = goalLoopProgress
    ? getGoalLoopResumePromptPreview(goalLoopProgress)
    : null
  const isFullAccessMode = mode === 'goal' || mode === 'agent'

  return (
    <footer className="border-border/40 border-t bg-background/80 backdrop-blur-md">
      <ChatAttachedTabs tabs={attachedTabs} onRemoveTab={onRemoveTab} />
      {visibleSelectedText && (
        <ChatSelectedText
          selectedText={visibleSelectedText}
          onDismiss={() => {
            if (!activeTabId) return
            const key = String(activeTabId)
            selectedTextStorage.getValue().then((map) => {
              const { [key]: _, ...rest } = map
              selectedTextStorage.setValue(rest)
            })
          }}
        />
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <ChatModeToggle mode={mode} onModeChange={onModeChange} />

          <div className="h-4 w-px bg-border/50" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => chatInputRef.current?.toggleTabMention()}
              data-tab-mention-trigger
              data-state={isTabMentionOpen ? 'open' : 'closed'}
              aria-expanded={isTabMentionOpen}
              aria-haspopup="dialog"
              className="flex cursor-pointer items-center gap-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-accent"
              title="Attach tabs (@)"
            >
              <Layers className="h-4 w-4" />
              {attachedTabs.length > 0 && (
                <span className="font-medium text-[var(--accent-orange)] text-xs">
                  {attachedTabs.length}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </button>

            {supports(Feature.WORKSPACE_FOLDER_SUPPORT) && (
              <WorkspaceSelector side="top">
                <button
                  type="button"
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-muted/50 data-[state=open]:bg-accent',
                    selectedFolder
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  title={
                    selectedFolder
                      ? selectedFolder.name
                      : 'Select workspace folder'
                  }
                >
                  <div className="relative">
                    <Folder className="h-4 w-4" />
                    {selectedFolder && (
                      <div className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)]" />
                    )}
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </WorkspaceSelector>
            )}

            {supports(Feature.MANAGED_MCP_SUPPORT) && (
              <AppSelector side="top">
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-accent"
                  title="Connect apps"
                >
                  {connectedManagedServers.length > 0 ? (
                    <>
                      <div className="flex items-center -space-x-1">
                        {connectedManagedServers.slice(0, 3).map((s) => (
                          <div
                            key={s.id}
                            className="rounded-full ring-2 ring-background"
                          >
                            <McpServerIcon
                              serverName={s.managedServerName ?? ''}
                              size={14}
                            />
                          </div>
                        ))}
                      </div>
                      {connectedManagedServers.length > 3 && (
                        <span className="font-medium text-xs">
                          +{connectedManagedServers.length - 3}
                        </span>
                      )}
                    </>
                  ) : (
                    <PlugZap className="h-4 w-4" />
                  )}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </AppSelector>
            )}
          </div>
        </div>

        {voice?.error && (
          <div className="mt-1 text-destructive text-xs">{voice.error}</div>
        )}

        {isFullAccessMode && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-primary text-xs">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Full Browser Access</span>
              </span>
              <span className="shrink-0 text-[10px] text-primary/80">
                all commands auto-run
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/30 p-1 text-xs">
              {GOAL_AGENT_STRATEGY_OPTIONS.map((strategy) => (
                <button
                  key={strategy.mode}
                  type="button"
                  onClick={() => onAgentStrategyModeChange(strategy.mode)}
                  className={cn(
                    'flex-1 rounded-md px-1.5 py-1 font-medium text-[11px] leading-tight transition-colors',
                    agentStrategyMode === strategy.mode
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground',
                  )}
                  title={`${strategy.label} strategy`}
                >
                  {strategy.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'goal' && goalLoopProgress && (
          <div className="mt-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                  <span className="capitalize">
                    {goalLoopLifecycle?.replaceAll('_', ' ')}
                  </span>
                  <span className="text-muted-foreground">
                    {goalLoopProgress.queueCounts.completed} done
                  </span>
                  <span className="text-muted-foreground">
                    {goalLoopProgress.queueCounts.pending} pending
                  </span>
                  {goalLoopProgress.queueCounts.failed > 0 && (
                    <span className="text-destructive">
                      {goalLoopProgress.queueCounts.failed} failed
                    </span>
                  )}
                  {goalLoopProgress.queueCounts.blocked > 0 && (
                    <span className="text-amber-600">
                      {goalLoopProgress.queueCounts.blocked} blocked
                    </span>
                  )}
                </div>
                {goalLoopProgress.currentItem && (
                  <div className="mt-1 truncate text-muted-foreground">
                    {goalLoopProgress.currentItem.title}
                    {goalLoopProgress.retryCount > 0 &&
                      ` · retry ${goalLoopProgress.retryCount}`}
                  </div>
                )}
                {goalLoopProgress.lastCheckpoint && (
                  <div className="mt-1 truncate text-muted-foreground">
                    {goalLoopProgress.lastCheckpoint.summary}
                  </div>
                )}
                {goalLoopProgress.continuation?.packet?.nextAction && (
                  <div className="mt-1 truncate text-muted-foreground">
                    {goalLoopProgress.continuation.packet.nextAction}
                  </div>
                )}
                {goalLoopProgressChips.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {goalLoopProgressChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-border/50 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                {goalLoopResumePromptPreview && (
                  <div
                    className="mt-1 truncate text-muted-foreground"
                    title={goalLoopResumePrompt ?? undefined}
                  >
                    Resume: {goalLoopResumePromptPreview}
                  </div>
                )}
                {goalLoopProgress.pauseReason && (
                  <div className="mt-1 line-clamp-2 text-amber-700">
                    {goalLoopProgress.pauseReason}
                  </div>
                )}
              </div>
              {activeGoalLoopId && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void onPauseGoalLoop?.()}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    title="Pause goal"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    <span className="sr-only">Pause goal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onResumeGoalLoop?.()}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    title="Resume goal"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span className="sr-only">Resume goal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onCancelGoalLoop?.()}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                    title="Cancel goal"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Cancel goal</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <ChatInput
          input={input}
          status={status}
          mode={mode}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          selectedTabs={attachedTabs}
          onToggleTab={onToggleTab}
          onTabMentionOpenChange={setIsTabMentionOpen}
          voice={voice}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          attachmentsEnabled={attachmentsEnabled}
          onCompact={onCompactConversation}
          ref={chatInputRef}
        />
      </div>
    </footer>
  )
}
