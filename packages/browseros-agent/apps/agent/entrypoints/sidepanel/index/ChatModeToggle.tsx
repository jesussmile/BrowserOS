import {
  Bot,
  Check,
  ChevronDown,
  type LucideIcon,
  MessageSquare,
  MousePointer2,
  Repeat2,
  Search,
} from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  CHAT_MODE_OPTIONS,
  type ChatMode,
  type ChatModeDetails,
} from './chatTypes'

interface ChatModeToggleProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

const modeIcons: Record<ChatMode, LucideIcon> = {
  chat: MessageSquare,
  research: Search,
  workflow: Repeat2,
  agent: Bot,
  goal: MousePointer2,
}

function ModeIcon({
  option,
  className,
}: {
  option: ChatModeDetails
  className?: string
}) {
  const Icon = modeIcons[option.mode]
  return <Icon className={className} />
}

export const ChatModeToggle: FC<ChatModeToggleProps> = ({
  mode,
  onModeChange,
}) => {
  const [open, setOpen] = useState(false)
  const selected = CHAT_MODE_OPTIONS.find((option) => option.mode === mode)
  const activeOption = selected ?? CHAT_MODE_OPTIONS[0]

  return (
    <TooltipProvider delayDuration={0}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex min-w-[94px] items-center justify-center gap-1.5 rounded-full border border-[var(--accent-orange)]/30 bg-[var(--accent-orange)]/10 px-2.5 py-1.5 font-medium text-[var(--accent-orange)] text-xs transition-all hover:bg-[var(--accent-orange)]/15"
              >
                <ModeIcon option={activeOption} className="h-3 w-3" />
                <span>{activeOption.shortLabel}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px]">
            {activeOption.description}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="start" className="w-72 p-1">
          <div className="grid gap-1">
            {CHAT_MODE_OPTIONS.map((option) => {
              const isSelected = option.mode === mode
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => {
                    onModeChange(option.mode)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-orange)]/10 text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background">
                    <ModeIcon option={option} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-sm">
                      {option.label}
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-[var(--accent-orange)]" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug">
                      {option.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}
