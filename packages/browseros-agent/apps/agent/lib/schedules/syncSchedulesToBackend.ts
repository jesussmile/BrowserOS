import type { ScheduledJob } from './scheduleTypes'

export async function syncSchedulesToBackend(
  localJobs: ScheduledJob[],
  userId: string,
): Promise<void> {
  void localJobs
  void userId
  // Private local-first build: scheduled jobs stay in local extension storage
  // and chrome.alarms. BrowserOS backend schedule sync is disabled.
}
