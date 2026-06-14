import { MessageSquare } from 'lucide-react'
import type { FC } from 'react'

export const LLM_HUB_HEADER_TITLE = 'Chat Provider'
export const LLM_HUB_HEADER_DESCRIPTION =
  'Configure browser chat providers and quick links.'

export const LlmHubHeader: FC = () => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-orange)]/10">
          <MessageSquare className="h-6 w-6 text-[var(--accent-orange)]" />
        </div>
        <div>
          <h2 className="mb-1 font-semibold text-xl">{LLM_HUB_HEADER_TITLE}</h2>
          <p className="text-muted-foreground text-sm">
            {LLM_HUB_HEADER_DESCRIPTION}
          </p>
        </div>
      </div>
    </div>
  )
}
