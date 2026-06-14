import {
  FileText,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  SquareStop,
  X,
} from 'lucide-react'
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
} from 'react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { TabPickerPopover } from '@/components/elements/tab-picker-popover'
import { type StagedAttachment, stageAttachments } from '@/lib/attachments'
import { cn } from '@/lib/utils'
import type { VoiceInputState } from '@/lib/voice/useVoiceInput'
import { CHAT_MODE_DETAILS, type ChatMode } from './chatTypes'

interface MentionState {
  isOpen: boolean
  filterText: string
  startPosition: number
}

interface ChatInputProps {
  input: string
  status: 'streaming' | 'submitted' | 'ready' | 'error'
  mode: ChatMode
  onInputChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onStop: () => void
  selectedTabs: chrome.tabs.Tab[]
  onToggleTab: (tab: chrome.tabs.Tab) => void
  onTabMentionOpenChange?: (isOpen: boolean) => void
  voice?: VoiceInputState
  attachments: StagedAttachment[]
  onAttachmentsChange: (attachments: StagedAttachment[]) => void
  attachmentsEnabled?: boolean
  onCompact?: () => void | Promise<void>
}

export interface ChatInputHandle {
  openTabMention: () => void
  closeTabMention: () => void
  toggleTabMention: () => void
  focus: () => void
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  (
    {
      input,
      status,
      mode,
      onInputChange,
      onSubmit: onSubmitProp,
      onStop,
      selectedTabs,
      onToggleTab,
      onTabMentionOpenChange,
      voice,
      attachments,
      onAttachmentsChange,
      attachmentsEnabled = true,
      onCompact,
    },
    ref,
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [attachmentError, setAttachmentError] = useState<string | null>(null)
    const [isStaging, setIsStaging] = useState(false)
    const [isDragOver, setIsDragOver] = useState(false)
    const [mentionState, setMentionState] = useState<MentionState>({
      isOpen: false,
      filterText: '',
      startPosition: 0,
    })

    const inputRef = useRef(input)
    const mentionStateRef = useRef(mentionState)

    useEffect(() => {
      inputRef.current = input
      mentionStateRef.current = mentionState
    })

    useEffect(() => {
      onTabMentionOpenChange?.(mentionState.isOpen)
    }, [mentionState.isOpen, onTabMentionOpenChange])

    const closeMention = useCallback(() => {
      const state = mentionStateRef.current
      if (state.isOpen) {
        const currentInput = inputRef.current
        const beforeMention = currentInput.slice(0, state.startPosition)
        const afterMention = currentInput.slice(
          state.startPosition + 1 + state.filterText.length,
        )
        const nextInput = beforeMention + afterMention
        inputRef.current = nextInput
        onInputChange(nextInput)
        const nextMentionState = {
          isOpen: false,
          filterText: '',
          startPosition: 0,
        }
        mentionStateRef.current = nextMentionState
        setMentionState(nextMentionState)

        requestAnimationFrame(() => {
          textareaRef.current?.focus()
          const newPosition = beforeMention.length
          textareaRef.current?.setSelectionRange(newPosition, newPosition)
        })
      }
    }, [onInputChange])

    const openMentionAtCursor = useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.focus()
      if (mentionStateRef.current.isOpen) return

      const currentInput = inputRef.current
      const cursorPosition = textarea.selectionStart ?? currentInput.length
      const beforeCursor = currentInput.slice(0, cursorPosition)
      const afterCursor = currentInput.slice(cursorPosition)

      const nextInput = `${beforeCursor}@${afterCursor}`
      inputRef.current = nextInput
      onInputChange(nextInput)
      const nextMentionState = {
        isOpen: true,
        filterText: '',
        startPosition: cursorPosition,
      }
      mentionStateRef.current = nextMentionState
      setMentionState(nextMentionState)

      requestAnimationFrame(() => {
        textarea.focus()
        const newPosition = cursorPosition + 1
        textarea.setSelectionRange(newPosition, newPosition)
      })
    }, [onInputChange])

    const toggleMentionAtCursor = useCallback(() => {
      if (mentionStateRef.current.isOpen) {
        closeMention()
        return
      }
      openMentionAtCursor()
    }, [closeMention, openMentionAtCursor])

    useImperativeHandle(
      ref,
      () => ({
        openTabMention: openMentionAtCursor,
        closeTabMention: closeMention,
        toggleTabMention: toggleMentionAtCursor,
        focus: () => textareaRef.current?.focus(),
      }),
      [closeMention, openMentionAtCursor, toggleMentionAtCursor],
    )

    const isBusy = status !== 'ready' && status !== 'error'
    const hasContent = input.trim().length > 0 || attachments.length > 0

    const stageFiles = async (files: File[]) => {
      if (files.length === 0) return
      if (!attachmentsEnabled) {
        setAttachmentError('Attachments are not supported in this view.')
        return
      }
      setIsStaging(true)
      setAttachmentError(null)
      try {
        const result = await stageAttachments(files, attachments.length)
        if (result.staged.length > 0) {
          onAttachmentsChange([...attachments, ...result.staged])
        }
        if (result.errors.length > 0) {
          setAttachmentError(result.errors.map((e) => e.message).join(' • '))
        }
      } finally {
        setIsStaging(false)
      }
    }

    const removeAttachment = (id: string) => {
      onAttachmentsChange(
        attachments.filter((attachment) => attachment.id !== id),
      )
      setAttachmentError(null)
    }

    const openFilePicker = () => {
      if (isBusy || isStaging || !attachmentsEnabled) return
      fileInputRef.current?.click()
    }

    const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length > 0) void stageFiles(files)
    }

    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = event.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        event.preventDefault()
        void stageFiles(files)
      }
    }

    const handleDrop = (event: DragEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length > 0) void stageFiles(files)
    }

    const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      setIsDragOver(true)
    }

    const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return
      }
      setIsDragOver(false)
    }

    const handleSubmit = (e: FormEvent) => {
      if (mentionStateRef.current.isOpen) {
        e.preventDefault()
        closeMention()
        return
      }
      if (isBusy) {
        e.preventDefault()
        return
      }
      if (!hasContent) {
        e.preventDefault()
        return
      }
      onSubmitProp(e)
    }

    const handleInputChange = (value: string) => {
      const textarea = textareaRef.current
      const cursorPosition = textarea?.selectionStart ?? value.length

      const state = mentionStateRef.current

      if (state.isOpen) {
        const textAfterAt = value.slice(state.startPosition + 1)
        const spaceIndex = textAfterAt.search(/\s/)
        const filterText =
          spaceIndex === -1 ? textAfterAt : textAfterAt.slice(0, spaceIndex)

        if (
          cursorPosition <= state.startPosition ||
          value[state.startPosition] !== '@'
        ) {
          const nextMentionState = {
            isOpen: false,
            filterText: '',
            startPosition: 0,
          }
          mentionStateRef.current = nextMentionState
          setMentionState(nextMentionState)
        } else {
          const nextMentionState = { ...state, filterText }
          mentionStateRef.current = nextMentionState
          setMentionState(nextMentionState)
        }
      } else {
        const charBeforeCursor = value[cursorPosition - 1]
        const textBeforeAt = value.slice(0, cursorPosition - 1)
        const isAtWordBoundary = /(?:^|[\s\n])$/.test(textBeforeAt)

        if (charBeforeCursor === '@' && isAtWordBoundary) {
          const nextMentionState = {
            isOpen: true,
            filterText: '',
            startPosition: cursorPosition - 1,
          }
          mentionStateRef.current = nextMentionState
          setMentionState(nextMentionState)
        }
      }

      inputRef.current = value
      onInputChange(value)
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (mentionState.isOpen) {
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'Enter' ||
          e.key === 'Escape'
        ) {
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          closeMention()
          return
        }
      }

      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault()
        if (hasContent && !isBusy) {
          e.currentTarget.form?.requestSubmit()
        }
      }
    }

    useEffect(() => {
      if (!mentionState.isOpen) return

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest('[data-tab-mention-trigger]')) return
        if (
          !textareaRef.current?.contains(target) &&
          !target.closest('[data-slot="popover-content"]')
        ) {
          closeMention()
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [mentionState.isOpen, closeMention])

    const renderVoiceButton = () => {
      if (!voice) return null

      if (voice.isRecording) {
        return (
          <button
            type="button"
            onClick={voice.onStopRecording}
            className="cursor-pointer rounded-full bg-red-600 p-2 text-white shadow-sm transition-all duration-200 hover:bg-red-900"
          >
            <Square className="h-3.5 w-3.5" />
            <span className="sr-only">Stop recording</span>
          </button>
        )
      }

      if (voice.isTranscribing) {
        return (
          <button
            type="button"
            disabled
            className="rounded-full p-2 text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="sr-only">Transcribing</span>
          </button>
        )
      }

      return (
        <button
          type="button"
          onClick={voice.onStartRecording}
          disabled={isBusy}
          className="cursor-pointer rounded-full p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic className="h-3.5 w-3.5" />
          <span className="sr-only">Voice input</span>
        </button>
      )
    }

    const renderSendButton = () => {
      if (isBusy) {
        return (
          <button
            type="button"
            onClick={onStop}
            className="cursor-pointer rounded-full bg-red-600 p-2 text-white shadow-sm transition-all duration-200 hover:bg-red-900"
          >
            <SquareStop className="h-3.5 w-3.5" />
            <span className="sr-only">Stop</span>
          </button>
        )
      }

      return (
        <button
          type="submit"
          disabled={!hasContent || voice?.isRecording || voice?.isTranscribing}
          className="cursor-pointer rounded-full bg-[var(--accent-orange)] p-2 text-white shadow-sm transition-all duration-200 hover:bg-[var(--accent-orange-bright)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          <span className="sr-only">Send</span>
        </button>
      )
    }

    return (
      <form
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative mt-2 w-full',
          isDragOver && 'rounded-2xl ring-2 ring-[var(--accent-orange)]/50',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,text/*,text/markdown,text/csv,application/json,application/pdf"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <TabPickerPopover
          variant="mention"
          isOpen={mentionState.isOpen}
          filterText={mentionState.filterText}
          selectedTabs={selectedTabs}
          onToggleTab={onToggleTab}
          onClose={closeMention}
          anchorRef={textareaRef}
        />
        {attachments.length > 0 || attachmentError ? (
          <AttachmentStrip
            attachments={attachments}
            onRemove={removeAttachment}
            error={attachmentError}
          />
        ) : null}
        <div className="relative flex w-full items-end gap-2">
          {voice?.isRecording ? (
            <div className="flex min-h-[42px] flex-1 items-center justify-center gap-1 rounded-2xl border border-red-500/50 bg-muted/50 px-4 py-2.5 pr-[7rem]">
              {voice.audioLevels.map((level, i) => (
                <div
                  key={i.toString()}
                  className="w-1 rounded-full bg-red-500 transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(20, level * 0.6))}px`,
                  }}
                />
              ))}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className={cn(
                'field-sizing-content max-h-60 min-h-[42px] flex-1 resize-none overflow-hidden rounded-2xl border border-border/50 bg-muted/50 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border focus:border-[var(--accent-orange)]',
                voice ? 'pr-[7rem]' : 'pr-20',
              )}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder={
                voice?.isTranscribing
                  ? 'Transcribing...'
                  : CHAT_MODE_DETAILS[mode].placeholder
              }
              disabled={voice?.isTranscribing}
              rows={1}
            />
          )}
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1">
            {onCompact && (
              <button
                type="button"
                onClick={() => void onCompact()}
                disabled={isBusy}
                className="cursor-pointer rounded-full p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                title="Compact conversation"
              >
                <span className="font-semibold text-[10px] leading-none">
                  /c
                </span>
                <span className="sr-only">Compact conversation</span>
              </button>
            )}
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isBusy || isStaging || !attachmentsEnabled}
              className="cursor-pointer rounded-full p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              title={isStaging ? 'Attaching files' : 'Attach files'}
            >
              {isStaging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
              <span className="sr-only">Attach files</span>
            </button>
            {renderVoiceButton()}
            {renderSendButton()}
          </div>
        </div>
        {isDragOver ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 font-medium text-foreground text-sm backdrop-blur-sm">
            Drop files to attach
          </div>
        ) : null}
      </form>
    )
  },
)

function AttachmentStrip({
  attachments,
  onRemove,
  error,
}: {
  attachments: StagedAttachment[]
  onRemove: (id: string) => void
  error: string | null
}) {
  return (
    <div className="mb-2">
      {attachments.length > 0 ? (
        <div className="styled-scrollbar flex max-h-28 flex-wrap gap-2 overflow-y-auto">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() => onRemove(attachment.id)}
            />
          ))}
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 text-destructive text-xs">{error}</div>
      ) : null}
    </div>
  )
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: StagedAttachment
  onRemove: () => void
}) {
  if (attachment.kind === 'image' && attachment.dataUrl) {
    return (
      <div className="group relative size-14 overflow-hidden rounded-md border border-border/60">
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="size-full object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          aria-label={`Remove ${attachment.name}`}
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }
  return (
    <div className="group flex max-w-[220px] items-center gap-2 rounded-md border border-border/60 bg-muted/50 px-2 py-1.5">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-xs">{attachment.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={`Remove ${attachment.name}`}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

ChatInput.displayName = 'ChatInput'
