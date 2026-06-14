/**
 * @license
 * Copyright 2025 BrowserOS
 */

import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GoalLoopBrowserExecutor,
  type GoalLoopBrowserExecutorBrowser,
} from '../../../src/api/services/goal-loop-browser-executor'
import type { GoalLoopExecutionContext } from '../../../src/api/services/goal-loop-service'
import type {
  LocalGoalQueueItem,
  LocalGoalRun,
} from '../../../src/api/services/local-session-service'
import type { PageInfo } from '../../../src/browser/browser'

describe('GoalLoopBrowserExecutor', () => {
  let tempDirs: string[] = []
  const originalStorageRoot = process.env.PANNAMOS_STORAGE_ROOT
  const originalOutputsDir = process.env.PANNAMOS_OUTPUTS_DIR
  const originalFetch = globalThis.fetch

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    )
    tempDirs = []
    if (originalStorageRoot === undefined) {
      delete process.env.PANNAMOS_STORAGE_ROOT
    } else {
      process.env.PANNAMOS_STORAGE_ROOT = originalStorageRoot
    }
    if (originalOutputsDir === undefined) {
      delete process.env.PANNAMOS_OUTPUTS_DIR
    } else {
      process.env.PANNAMOS_OUTPUTS_DIR = originalOutputsDir
    }
    globalThis.fetch = originalFetch
  })

  it('navigates with the real browser abstraction', async () => {
    const calls: string[] = []
    const browser = createBrowserMock({
      newPage: async (url) => {
        calls.push(`newPage:${url}`)
        return 2
      },
      goto: async (page, url) => {
        calls.push(`goto:${page}:${url}`)
      },
      listPages: async () => [
        createPage({
          pageId: 2,
          url: 'https://example.test',
          title: 'Example',
        }),
      ],
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        sourceUrl: 'https://example.test',
        metadata: { action: 'navigate', risk: 'low' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      sourceUrl: 'https://example.test',
      evidence: {
        action: 'navigate',
        pageId: 2,
        url: 'https://example.test',
      },
    })
    expect(calls).toEqual([
      'newPage:https://example.test',
      'goto:2:https://example.test',
    ])
  })

  it('reads page text, snapshot, and links as evidence', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/read' }),
      snapshot: async () => '[1] link "Docs"',
      contentAsMarkdown: async () => 'Page markdown body',
      getPageLinks: async () => [
        { text: 'Docs', href: 'https://example.test/docs' },
      ],
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        metadata: { action: 'extract', risk: 'low' },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'extract',
        text: 'Page markdown body',
        snapshot: '[1] link "Docs"',
        links: [{ text: 'Docs', href: 'https://example.test/docs' }],
      },
    })
  })

  it('saves low-risk download items as local PDFs', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'goal-loop-output-'))
    tempDirs.push(outputDir)
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/chart' }),
      printToPDF: async () => ({
        data: Buffer.from('%PDF-test').toString('base64'),
      }),
    })
    const executor = new GoalLoopBrowserExecutor({ browser, outputDir })

    const result = await executor.execute(
      createContext({
        title: 'Download KJFK chart',
        metadata: {
          action: 'download',
          risk: 'low',
          filename: 'kjfk-chart.pdf',
        },
      }),
    )

    expect(result.status).toBe('completed')
    expect(result.artifactPath).toContain('kjfk-chart.pdf')
    expect(result.evidence).toMatchObject({
      action: 'download',
      mode: 'pdf',
      bytes: 9,
    })
  })

  it('uses the configured Goal Loop outputs directory by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pannamos-goal-root-'))
    tempDirs.push(root)
    process.env.PANNAMOS_STORAGE_ROOT = root
    delete process.env.PANNAMOS_OUTPUTS_DIR

    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/chart' }),
      printToPDF: async () => ({
        data: Buffer.from('%PDF-test').toString('base64'),
      }),
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Download chart',
        metadata: {
          action: 'download',
          risk: 'low',
          filename: 'chart.pdf',
        },
      }),
    )

    expect(result.status).toBe('completed')
    expect(result.artifactPath).toContain(
      join(root, 'Outputs', 'GoalLoop', 'goal-1'),
    )
  })

  it('clicks by searched selector when browser search returns an element', async () => {
    const clicked: number[] = []
    const browser = createBrowserMock({
      getActivePage: async () => createPage({ pageId: 1 }),
      searchDom: async () => ({
        totalCount: 1,
        results: [{ backendNodeId: 99, tag: 'button' }],
      }),
      click: async (_page, element) => {
        clicked.push(element)
        return { x: 10, y: 20 }
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        metadata: {
          action: 'click',
          risk: 'low',
          selector: 'button.download',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'click',
        element: 99,
        coordinates: { x: 10, y: 20 },
      },
    })
    expect(clicked).toEqual([99])
  })

  it('blocks ambiguous click items instead of guessing', async () => {
    const executor = new GoalLoopBrowserExecutor({
      browser: createBrowserMock({
        getActivePage: async () => createPage({ pageId: 1 }),
      }),
    })

    const result = await executor.execute(
      createContext({
        metadata: { action: 'click', risk: 'low' },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      error: 'No click target metadata was supplied.',
    })
  })

  it('fills low-risk fields by searched selector', async () => {
    const fills: Array<{
      page: number
      element: number
      text: string
      clear?: boolean
    }> = []
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/form' }),
      searchDom: async () => ({
        totalCount: 1,
        results: [{ backendNodeId: 42, tag: 'input' }],
      }),
      fill: async (page, element, text, clear) => {
        fills.push({ page, element, text, clear })
        return { x: 14, y: 28 }
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Enter airport code',
        metadata: {
          action: 'fill',
          risk: 'low',
          selector: 'input[name=q]',
          value: 'KJFK',
          clear: false,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'fill',
        element: 42,
        textLength: 4,
        clear: false,
        coordinates: { x: 14, y: 28 },
      },
    })
    expect(fills).toEqual([
      { page: 1, element: 42, text: 'KJFK', clear: false },
    ])
  })

  it('selects low-risk dropdown options by visible text or value', async () => {
    const selections: Array<{ page: number; element: number; value: string }> =
      []
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 3, url: 'https://example.test/filter' }),
      selectOption: async (page, element, value) => {
        selections.push({ page, element, value })
        return 'Azerbaijan (UB)'
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Select authority',
        metadata: {
          action: 'select',
          risk: 'low',
          element: 77,
          value: 'Azerbaijan (UB)',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'select',
        pageId: 3,
        element: 77,
        value: 'Azerbaijan (UB)',
        selected: 'Azerbaijan (UB)',
      },
    })
    expect(selections).toEqual([
      { page: 3, element: 77, value: 'Azerbaijan (UB)' },
    ])
  })

  it('checks and unchecks low-risk controls by element id', async () => {
    const calls: string[] = []
    const browser = createBrowserMock({
      getActivePage: async () => createPage({ pageId: 5 }),
      check: async (page, element) => {
        calls.push(`check:${page}:${element}`)
      },
      uncheck: async (page, element) => {
        calls.push(`uncheck:${page}:${element}`)
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const checked = await executor.execute(
      createContext({
        title: 'Enable public charts filter',
        metadata: { action: 'check', risk: 'low', element: 7 },
      }),
    )
    const unchecked = await executor.execute(
      createContext({
        title: 'Disable archived filter',
        metadata: { action: 'uncheck', risk: 'low', element: 8 },
      }),
    )

    expect(checked).toMatchObject({
      status: 'completed',
      evidence: { action: 'check', element: 7 },
    })
    expect(unchecked).toMatchObject({
      status: 'completed',
      evidence: { action: 'uncheck', element: 8 },
    })
    expect(calls).toEqual(['check:5:7', 'uncheck:5:8'])
  })

  it('blocks ambiguous field edits instead of guessing', async () => {
    const executor = new GoalLoopBrowserExecutor({
      browser: createBrowserMock({
        getActivePage: async () => createPage({ pageId: 1 }),
      }),
    })

    const result = await executor.execute(
      createContext({
        metadata: { action: 'fill', risk: 'low', value: 'KJFK' },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      error: 'No fill target metadata was supplied.',
    })
  })

  it('clicks high-risk login targets when Full Browser Access supplies concrete metadata', async () => {
    const clicked: number[] = []
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/login' }),
      searchDom: async (_page, query) => ({
        totalCount: 1,
        results: [{ backendNodeId: query === 'Login' ? 42 : 0, tag: 'button' }],
      }),
      click: async (_page, element) => {
        clicked.push(element)
        return { x: 10, y: 20 }
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Submit login',
        metadata: {
          action: 'login',
          risk: 'high',
          selector: 'Login',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'click',
        element: 42,
      },
    })
    expect(clicked).toEqual([42])
  })

  it('fills high-risk credential fields when Full Browser Access supplies concrete metadata', async () => {
    const fills: Array<{ element: number; text: string }> = []
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/login' }),
      searchDom: async (_page, query) => ({
        totalCount: 1,
        results: [
          { backendNodeId: query === 'Password:' ? 84 : 0, tag: 'input' },
        ],
      }),
      fill: async (_page, element, text) => {
        fills.push({ element, text })
        return { x: 20, y: 30 }
      },
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Enter password',
        metadata: {
          action: 'credential',
          risk: 'high',
          selector: 'Password:',
          value: 'test-password',
          clear: true,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'fill',
        element: 84,
        textLength: 'test-password'.length,
      },
    })
    expect(fills).toEqual([{ element: 84, text: 'test-password' }])
  })

  it('blocks broad extract items that need source-list expansion', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'chrome://newtab/', title: 'PannamOS' }),
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Process all remaining blocked countries and airports',
        metadata: {
          action: 'extract',
          risk: 'low',
          requiresQueueExpansion: true,
          expansionReason: 'Needs a durable source list.',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      error: 'Needs a durable source list.',
      evidence: {
        action: 'extract',
        requiresQueueExpansion: true,
      },
    })
  })

  it('blocks any broad item that needs source-list expansion before action-specific execution', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({
          pageId: 1,
          url: 'https://www.google.com/search?q=yahoo',
          title: 'Google Search',
        }),
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Download PDF charts for all remaining countries and airports',
        metadata: {
          action: 'download',
          risk: 'low',
          downloadMode: 'pdf',
          requiresQueueExpansion: true,
          expansionReason: 'Needs a durable source list.',
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      error: 'Needs a durable source list.',
      sourceUrl: 'https://www.google.com/search?q=yahoo',
      evidence: {
        action: 'download',
        requiresQueueExpansion: true,
      },
    })
  })

  it('downloads URL source lists and generates country queue items', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'goal-loop-source-'))
    tempDirs.push(outputDir)
    const countriesPath = join(outputDir, 'countries.csv')
    await writeFile(countriesPath, 'code,name\nUS,United States\nCA,Canada\n')
    globalThis.fetch = (async () =>
      new Response(
        [
          'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,iata_code,local_code,home_link,wikipedia_link,keywords',
          '1,KJFK,large_airport,John F Kennedy International Airport,0,0,13,NA,US,US-NY,New York,yes,KJFK,JFK,JFK,,,',
          '2,CYYZ,large_airport,Toronto Pearson International Airport,0,0,569,NA,CA,CA-ON,Toronto,yes,CYYZ,YYZ,YYZ,,,',
        ].join('\n'),
      )) as typeof fetch
    const executor = new GoalLoopBrowserExecutor({
      browser: createBrowserMock(),
      outputDir,
    })
    const context = createContext({
      id: 'airports-source',
      title: 'Download global airport source list and expand countries',
      sourceUrl: 'https://ourairports.com/data/airports.csv',
      metadata: {
        action: 'download',
        risk: 'low',
        downloadMode: 'url',
        filename: 'airports.csv',
        sourceKind: 'ourairports-airports',
        queueExpansion: 'ourairports-countries',
        url: 'https://ourairports.com/data/airports.csv',
      },
    })
    context.goal.queue = [
      {
        id: 'countries-source',
        goalRunId: context.goal.id,
        orderIndex: 0,
        title: 'Download countries',
        status: 'completed',
        attempts: 1,
        maxAttempts: 3,
        artifactPath: countriesPath,
        metadata: {
          action: 'download',
          risk: 'low',
          sourceKind: 'ourairports-countries',
        },
        createdAt: 1,
        updatedAt: 1,
      },
      context.item,
    ]

    const result = await executor.execute(context)

    expect(result).toMatchObject({
      status: 'completed',
      sourceUrl: 'https://ourairports.com/data/airports.csv',
      evidence: {
        action: 'download',
        mode: 'url',
        sourceKind: 'ourairports-airports',
        queueExpansion: 'ourairports-countries',
        generatedQueueItemCount: 2,
      },
    })
    expect(result.artifactPath).toContain('airports.csv')
    expect(result.generatedQueueItems?.map((item) => item.title)).toEqual([
      'Process airports for Canada (CA)',
      'Process airports for United States (US)',
    ])
  })

  it('writes per-country airport CSV artifacts from downloaded sources', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'goal-loop-country-'))
    tempDirs.push(outputDir)
    const airportsPath = join(outputDir, 'airports.csv')
    await writeFile(
      airportsPath,
      [
        'id,ident,type,name,iso_country,municipality,iata_code',
        '1,KJFK,large_airport,John F Kennedy International Airport,US,New York,JFK',
        '2,CYYZ,large_airport,Toronto Pearson International Airport,CA,Toronto,YYZ',
      ].join('\n'),
    )
    const executor = new GoalLoopBrowserExecutor({
      browser: createBrowserMock(),
      outputDir,
    })
    const context = createContext({
      id: 'country-us',
      title: 'Process airports for United States (US)',
      metadata: {
        action: 'extract',
        risk: 'low',
        sourceKind: 'ourairports-country',
        countryCode: 'US',
        countryName: 'United States',
        filename: 'US-United States-airports.csv',
      },
    })
    context.goal.queue = [
      {
        id: 'airports-source',
        goalRunId: context.goal.id,
        orderIndex: 0,
        title: 'Download airports',
        status: 'completed',
        attempts: 1,
        maxAttempts: 3,
        sourceUrl: 'https://ourairports.com/data/airports.csv',
        artifactPath: airportsPath,
        metadata: {
          action: 'download',
          risk: 'low',
          sourceKind: 'ourairports-airports',
        },
        createdAt: 1,
        updatedAt: 1,
      },
      context.item,
    ]

    const result = await executor.execute(context)

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'extract',
        sourceKind: 'ourairports-country',
        countryCode: 'US',
        airportCount: 1,
      },
    })
    const csv = await readFile(result.artifactPath!, 'utf8')
    expect(csv).toContain('KJFK')
    expect(csv).not.toContain('CYYZ')
  })

  it('completes approved login items when an authenticated session is visible', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'chrome://newtab/' }),
      listPages: async () => [
        createPage({ pageId: 1, url: 'chrome://newtab/' }),
        createPage({ pageId: 2, url: 'https://www.google.com/' }),
      ],
      snapshot: async (page) =>
        page === 2
          ? '[79] button "Google Account: Test User (user@example.test)"'
          : '[1] textbox "Search"',
      contentAsMarkdown: async (page) =>
        page === 2 ? 'Google Account signed in' : 'PannamOS new tab',
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Log in to account',
        metadata: {
          action: 'login',
          risk: 'high',
          approvalGranted: true,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'completed',
      evidence: {
        action: 'login',
        pageId: 2,
        authenticatedSessionDetected: true,
        approvalGranted: true,
      },
    })
  })

  it('does not treat PannamOS new tab or ChatGPT account text as target login success', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'chrome://newtab/', title: 'PannamOS' }),
      listPages: async () => [
        createPage({ pageId: 1, url: 'chrome://newtab/', title: 'PannamOS' }),
      ],
      snapshot: async () =>
        '[56] textbox "Ask ChatGPT Plus/Pro (user@example.test) to handle a task..."',
      contentAsMarkdown: async () =>
        'PannamOS ChatGPT Plus/Pro user@example.test',
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Log in to Eurocontrol',
        metadata: {
          action: 'login',
          risk: 'high',
          approvalGranted: true,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      evidence: {
        action: 'login',
        authenticatedSessionDetected: false,
      },
    })
  })

  it('does not treat an arbitrary email address as authenticated session evidence', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/login' }),
      listPages: async () => [
        createPage({ pageId: 1, url: 'https://example.test/login' }),
      ],
      snapshot: async () => '[1] textbox "Email"',
      contentAsMarkdown: async () => 'Contact webmaster@example.test for help.',
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Log in to example',
        metadata: {
          action: 'login',
          risk: 'high',
          approvalGranted: true,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      evidence: {
        action: 'login',
        authenticatedSessionDetected: false,
      },
    })
  })

  it('blocks approved credential items when no authenticated session is visible', async () => {
    const browser = createBrowserMock({
      getActivePage: async () =>
        createPage({ pageId: 1, url: 'https://example.test/login' }),
      snapshot: async () => '[1] textbox "Password"',
      contentAsMarkdown: async () => 'Enter your password',
    })
    const executor = new GoalLoopBrowserExecutor({ browser })

    const result = await executor.execute(
      createContext({
        title: 'Create a password',
        metadata: {
          action: 'credential',
          risk: 'high',
          approvalGranted: true,
        },
      }),
    )

    expect(result).toMatchObject({
      status: 'blocked',
      retryable: false,
      error:
        'Approved credential entry requires an existing signed-in browser session or a dedicated high-risk form executor.',
      evidence: {
        action: 'credential',
        authenticatedSessionDetected: false,
        approvalGranted: true,
      },
    })
  })
})

function createBrowserMock(
  overrides: Partial<GoalLoopBrowserExecutorBrowser> = {},
): GoalLoopBrowserExecutorBrowser {
  return {
    listPages: async () => [createPage({ pageId: 1 })],
    getActivePage: async () => createPage({ pageId: 1 }),
    newPage: async () => 1,
    goto: async () => {},
    waitFor: async () => true,
    snapshot: async () => '',
    content: async () => '',
    contentAsMarkdown: async () => '',
    getPageLinks: async () => [],
    searchDom: async () => ({ results: [], totalCount: 0 }),
    click: async () => undefined,
    clickAt: async () => {},
    scroll: async () => {},
    fill: async () => undefined,
    selectOption: async () => '',
    check: async () => {},
    uncheck: async () => {},
    printToPDF: async () => ({
      data: Buffer.from('%PDF').toString('base64'),
    }),
    downloadViaClick: async () => ({
      filePath: '',
      suggestedFilename: '',
    }),
    ...overrides,
  }
}

function createContext(
  item: Partial<LocalGoalQueueItem> = {},
): GoalLoopExecutionContext {
  const goal: LocalGoalRun = {
    id: 'goal-1',
    prompt: 'Complete a browser goal',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    queue: [],
    checkpoints: [],
  }
  const queueItem: LocalGoalQueueItem = {
    id: 'item-1',
    goalRunId: goal.id,
    orderIndex: 0,
    title: 'Read current page',
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    createdAt: 1,
    updatedAt: 1,
    ...item,
  }
  return {
    goal,
    item: queueItem,
    contract: {
      version: 1,
      prompt: goal.prompt,
      completionCriteria: [],
      approvalScope: {
        autoApprove: ['read', 'navigate', 'click', 'scroll', 'download'],
        pauseFor: ['login', 'credential'],
      },
      retryLimit: 3,
      finalManifestShape: [],
      createdAt: 1,
    },
    attempt: 1,
  }
}

function createPage(overrides: Partial<PageInfo> = {}): PageInfo {
  return {
    pageId: 1,
    targetId: 'target-1',
    tabId: 1,
    url: 'about:blank',
    title: '',
    isActive: true,
    isLoading: false,
    loadProgress: 1,
    isPinned: false,
    isHidden: false,
    ...overrides,
  }
}
