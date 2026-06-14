import { useEffect, useState } from 'react'
import { importHintDismissedAtStorage } from '@/lib/onboarding/onboardingStorage'

export type HintType = 'import'

const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000

function isEligible(dismissedAt: number | null): boolean {
  return !dismissedAt || Date.now() - dismissedAt >= DISMISS_DURATION
}

export function useActiveHint(): HintType | null {
  const [hint, setHint] = useState<HintType | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function resolve() {
      const importDismissedAt = await importHintDismissedAtStorage.getValue()
      if (cancelled) return

      if (isEligible(importDismissedAt)) {
        timer = setTimeout(() => {
          if (!cancelled) setHint('import')
        }, 2000)
        return
      }
    }

    resolve()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return hint
}
