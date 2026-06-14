import { Database, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ONBOARDING_SIGNIN_SKIPPED_EVENT,
  ONBOARDING_STEP_COMPLETED_EVENT,
} from '@/lib/constants/analyticsEvents'
import { track } from '@/lib/metrics/track'
import { type StepDirection, StepTransition } from './StepTransition'

interface StepTwoProps {
  direction: StepDirection
  onContinue: () => void
}

export const StepTwo = ({ direction, onContinue }: StepTwoProps) => {
  const handleContinue = () => {
    track(ONBOARDING_SIGNIN_SKIPPED_EVENT)
    track(ONBOARDING_STEP_COMPLETED_EVENT, {
      step: 3,
      step_name: 'local_setup',
      skipped: true,
    })
    onContinue()
  }

  return (
    <StepTransition direction={direction}>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="font-bold text-3xl tracking-tight">
              Local-only mode
            </h2>
            <p className="text-base text-muted-foreground">
              Cloud login is disabled in this private PannamOS build.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground">
                Sessions, messages, goals, and audit events stay in the local
                PannamOS database on this PC.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground">
                Model access is configured separately through user-owned
                providers such as ChatGPT, OpenAI, Anthropic, Ollama, or LM
                Studio.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground">
                Browser actions that submit, delete, upload, purchase, or change
                account data require supervision.
              </p>
            </div>
          </div>

          <Button className="w-full" onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </div>
    </StepTransition>
  )
}
