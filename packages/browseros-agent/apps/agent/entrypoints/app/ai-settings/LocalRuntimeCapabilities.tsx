import {
  Bot,
  CheckCircle2,
  ShieldCheck,
  UserRoundCog,
  Wrench,
} from 'lucide-react'
import type { FC } from 'react'
import { useLocalAgentCapabilities } from '@/entrypoints/app/agents/useAgents'
import { cn } from '@/lib/utils'

export const LocalRuntimeCapabilities: FC = () => {
  const { capabilities, loading, error } = useLocalAgentCapabilities()

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--accent-orange)]" />
            <h2 className="font-semibold text-base">Local runtime</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-sm">
            Agent adapters and runtime skills come from the local PannamOS
            server. Upstream cloud app auth is disabled.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs',
            capabilities?.localFirst
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <CheckCircle2 className="size-3.5" />
          Local first
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center gap-2 font-medium text-sm">
            <Bot className="size-4 text-muted-foreground" />
            Agents
          </div>
          <div className="flex flex-wrap gap-2">
            {loading ? (
              <CapabilityPill label="Loading" muted />
            ) : error ? (
              <CapabilityPill label="Unavailable" muted />
            ) : (
              capabilities?.adapters.map((adapter) => (
                <CapabilityPill key={adapter.id} label={adapter.name} />
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 font-medium text-sm">
            <UserRoundCog className="size-4 text-muted-foreground" />
            Roles
          </div>
          <div className="grid gap-2">
            {loading ? (
              <CapabilityPill label="Loading" muted />
            ) : error ? (
              <CapabilityPill label="Unavailable" muted />
            ) : (
              capabilities?.roles.map((role) => (
                <div
                  key={role.id}
                  className="rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="font-medium text-sm">{role.name}</div>
                  <div className="mt-0.5 text-muted-foreground text-xs">
                    {role.shortDescription}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 font-medium text-sm">
            <Wrench className="size-4 text-muted-foreground" />
            Skills
          </div>
          <div className="grid gap-2">
            {loading ? (
              <CapabilityPill label="Loading" muted />
            ) : error ? (
              <CapabilityPill label="Unavailable" muted />
            ) : (
              capabilities?.skills.map((skill) => (
                <div
                  key={skill.id}
                  className="rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-medium text-sm">
                      {skill.name}
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase">
                      {skill.source === 'repo_skill' ? 'Repo' : 'Runtime'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-muted-foreground text-xs">
                    {skill.description}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const CapabilityPill: FC<{ label: string; muted?: boolean }> = ({
  label,
  muted,
}) => (
  <span
    className={cn(
      'inline-flex rounded-full border px-2.5 py-1 font-medium text-xs',
      muted
        ? 'border-border bg-muted text-muted-foreground'
        : 'border-[var(--accent-orange)]/25 bg-[var(--accent-orange)]/10 text-[var(--accent-orange)]',
    )}
  >
    {label}
  </span>
)
