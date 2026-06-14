import { onboardingProfileStorage } from './onboardingStorage'

export async function syncOnboardingProfile(_userId: string): Promise<void> {
  // BrowserOS cloud profile sync is disabled. Clear the temporary onboarding
  // profile once local onboarding completes so it is not retried.
  await onboardingProfileStorage.removeValue()
}
