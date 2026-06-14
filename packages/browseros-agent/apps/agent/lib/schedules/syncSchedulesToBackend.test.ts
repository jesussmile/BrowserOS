import { afterEach, describe, expect, it, mock } from 'bun:test'
import { syncSchedulesToBackend } from './syncSchedulesToBackend'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('syncSchedulesToBackend', () => {
  it('does not sync schedules to BrowserOS backend in the private build', async () => {
    const fetchMock = mock(() => {
      throw new Error('unexpected network call')
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await syncSchedulesToBackend(
      [
        {
          id: 'job-1',
          name: 'Local job',
          query: 'Do local work',
          scheduleType: 'daily',
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      'user-1',
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
