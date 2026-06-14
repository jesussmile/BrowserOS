import {
  BotIcon,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  ShieldX,
  XCircle,
} from 'lucide-react'
import { type FC, useEffect, useState } from 'react'
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from '@/components/ai-elements/task'
import { Button } from '@/components/ui/button'
import type {
  ToolInvocationInfo,
  ToolInvocationState,
} from './getMessageSegments'
import type { ToolApprovalResponder } from './useChatSessionApprovals'

interface ToolBatchProps {
  tools: ToolInvocationInfo[]
  isLastBatch: boolean
  isLastMessage: boolean
  isStreaming: boolean
  onToolApprovalResponse?: ToolApprovalResponder
}

export const ToolBatch: FC<ToolBatchProps> = ({
  tools,
  isLastBatch,
  isLastMessage,
  isStreaming,
  onToolApprovalResponse,
}) => {
  const hasPendingApproval = tools.some((tool) =>
    isToolWaitingForApproval(tool.state),
  )
  const shouldBeOpen =
    isLastMessage && isLastBatch && (isStreaming || hasPendingApproval)
  const [isOpen, setIsOpen] = useState(shouldBeOpen)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)

  useEffect(() => {
    if (isLastMessage && !hasUserInteracted) {
      if (isLastBatch) {
        setIsOpen(isStreaming || hasPendingApproval)
      } else {
        setIsOpen(false)
      }
    }
  }, [
    hasPendingApproval,
    isStreaming,
    isLastMessage,
    isLastBatch,
    hasUserInteracted,
  ])

  const completedCount = tools.filter((t) => isToolCompleted(t.state)).length
  const triggerTitle = hasPendingApproval
    ? 'Approval needed'
    : `${completedCount}/${tools.length} actions completed`

  const onManualToggle = (newState: boolean) => {
    setHasUserInteracted(true)
    setIsOpen(newState)
  }

  return (
    <Task open={isOpen} onOpenChange={onManualToggle}>
      <TaskTrigger title={triggerTitle} TriggerIcon={BotIcon} />
      <TaskContent>
        {tools.map((tool) => (
          <div key={tool.toolCallId}>
            <TaskItem className="flex items-center gap-2">
              <ToolStatusIcon state={tool.state} />
              <span className="flex-1">{formatToolName(tool.toolName)}</span>
              {isToolWaitingForApproval(tool.state) &&
              tool.approval?.id &&
              onToolApprovalResponse ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onToolApprovalResponse({
                        id: tool.approval?.id ?? '',
                        approved: false,
                        reason: 'Denied by user',
                      })
                    }
                  >
                    <ShieldX className="h-3.5 w-3.5" />
                    Deny
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      onToolApprovalResponse({
                        id: tool.approval?.id ?? '',
                        approved: true,
                      })
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              ) : null}
            </TaskItem>
          </div>
        ))}
      </TaskContent>
    </Task>
  )
}

const formatToolName = (name: string) => {
  return name
    ?.replace(/_/g, ' ')
    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
    ?.replace(/^./, (s) => s.toUpperCase())
}

const isToolCompleted = (state: ToolInvocationState) =>
  state === 'result' ||
  state === 'output-available' ||
  state === 'approval-responded'

const isToolInProgress = (state: ToolInvocationState) =>
  state === 'call' || state === 'input-available'

const isToolError = (state: ToolInvocationState) => state === 'output-error'

const isToolDenied = (state: ToolInvocationState) => state === 'output-denied'

const isToolWaitingForApproval = (state: ToolInvocationState) =>
  state === 'approval-requested'

const ToolStatusIcon: FC<{ state: ToolInvocationState }> = ({ state }) => {
  if (isToolCompleted(state)) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  }
  if (isToolWaitingForApproval(state)) {
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />
  }
  if (isToolDenied(state)) {
    return <ShieldX className="h-3.5 w-3.5 text-red-400" />
  }
  if (isToolInProgress(state)) {
    return (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-orange)]" />
    )
  }
  if (isToolError(state)) {
    return <XCircle className="h-3.5 w-3.5 text-destructive" />
  }
  return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
}
