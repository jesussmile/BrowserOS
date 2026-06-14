const CHANGELOG_BASE_URL = 'app.html#/onboarding/features'

type ChangelogVersionConfig = {
  showChangelog: true
  anchor?: string
}

/**
 * Whitelist of extension versions that should show changelog.
 * Only versions in this list will trigger changelog notification.
 * Unlisted versions = no changelog shown.
 *
 * @example
 * '0.0.21': { showChangelog: true }  // opens base changelog URL
 * '0.0.25': { showChangelog: true, anchor: 'v0-0-25' }  // opens changelog#v0-0-25
 */
export const CHANGELOG_VERSIONS: Record<string, ChangelogVersionConfig> = {
  // Private builds do not open upstream BrowserOS changelog pages.
}

export function getChangelogUrl(version: string): string {
  const config = CHANGELOG_VERSIONS[version]
  if (!config?.anchor) return CHANGELOG_BASE_URL
  return `${CHANGELOG_BASE_URL}#${config.anchor}`
}

export function shouldShowChangelog(version: string): boolean {
  return CHANGELOG_VERSIONS[version]?.showChangelog === true
}
