import { describe, expect, it } from 'bun:test'
import {
  getSupervisedApprovalDecision,
  needsSupervisedApproval,
} from '../../src/agent/tool-risk'
import type { BrowserApprovalTargetSummary } from '../../src/browser/browser'
import type { ToolContext } from '../../src/tools/framework'

describe('supervised tool approval risk gate', () => {
  it('requires approval for file uploads and JavaScript execution', async () => {
    const ctx = createContext()

    await expect(needsSupervisedApproval('upload_file', {}, ctx)).resolves.toBe(
      true,
    )
    await expect(
      needsSupervisedApproval('evaluate_script', {}, ctx),
    ).resolves.toBe(true)
  })

  it('auto-approves every browser tool in Full Browser Access', async () => {
    const ctx = createContext({ fullBrowserAccess: true })

    await expect(
      needsSupervisedApproval('download_file', {}, ctx),
    ).resolves.toBe(false)
    await expect(needsSupervisedApproval('upload_file', {}, ctx)).resolves.toBe(
      false,
    )
    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: "document.querySelector('button')?.click()" },
        ctx,
      ),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval('press_key', { key: 'Enter' }, ctx),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval('click_at', { page: 1, x: 10, y: 20 }, ctx),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval('fill', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval('select_option', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
  })

  it('allows safe read-only page metadata scripts', async () => {
    const ctx = createContext()

    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: '({ title: document.title, url: location.href })' },
        ctx,
      ),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: 'document.title' },
        ctx,
      ),
    ).resolves.toBe(false)
  })

  it('allows read-only page extraction scripts', async () => {
    const ctx = createContext()

    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: 'document.body.innerText' },
        ctx,
      ),
    ).resolves.toBe(false)
    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        {
          expression:
            "(() => Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.textContent?.trim(), href: a.href })).slice(0, 20))()",
        },
        ctx,
      ),
    ).resolves.toBe(false)
  })

  it('requires approval for non-allowlisted JavaScript', async () => {
    const ctx = createContext()

    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: "document.querySelector('button')?.click()" },
        ctx,
      ),
    ).resolves.toBe(true)
    await expect(
      needsSupervisedApproval(
        'evaluate_script',
        { expression: "document.body.innerHTML = '<p>changed</p>'" },
        ctx,
      ),
    ).resolves.toBe(true)
  })

  it('requires approval before pressing Enter', async () => {
    const ctx = createContext()

    await expect(
      needsSupervisedApproval('press_key', { key: 'Enter' }, ctx),
    ).resolves.toBe(true)
    await expect(
      needsSupervisedApproval('press_key', { key: 'Escape' }, ctx),
    ).resolves.toBe(false)
  })

  it('requires approval for form submit clicks', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'button',
        text: 'Submit',
        isInForm: true,
        isSubmitControl: true,
      },
    })

    const decision = await getSupervisedApprovalDecision(
      'click',
      { page: 1, element: 2 },
      ctx,
    )

    expect(decision.required).toBe(true)
    expect(decision.reason).toContain('Submitting')
  })

  it('allows routine cookie consent submit clicks', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'button',
        text: 'Accept all cookies',
        pageTitle: 'Cookie settings',
        isInForm: true,
        isSubmitControl: true,
      },
    })

    await expect(
      needsSupervisedApproval('click', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
  })

  it('allows low-risk clicks when the target is known', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'a',
        text: 'Read more',
        href: 'https://example.com/docs',
        isInForm: false,
        isSubmitControl: false,
      },
    })

    await expect(
      needsSupervisedApproval('click', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
  })

  it('allows element clicks even when target summarization fails', async () => {
    const ctx = createContext({ elementTarget: null })

    await expect(
      needsSupervisedApproval('click', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
  })

  it('fails closed for unverifiable coordinate clicks', async () => {
    const ctx = createContext({ pointTarget: null })

    await expect(
      needsSupervisedApproval('click_at', { page: 1, x: 10, y: 20 }, ctx),
    ).resolves.toBe(true)
  })

  it('requires approval for account-related field edits', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'input',
        type: 'email',
        name: 'account_email',
        pageUrl: 'https://example.com/account/settings',
        isEditable: true,
      },
    })

    await expect(
      needsSupervisedApproval('fill', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(true)
  })

  it('requires approval for form control changes', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'select',
        text: 'Plan',
        isInForm: true,
      },
    })

    await expect(
      needsSupervisedApproval('select_option', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(true)
  })

  it('allows routine non-sensitive form control changes', async () => {
    const ctx = createContext({
      elementTarget: {
        tagName: 'select',
        text: 'Country filter',
        isInForm: true,
      },
    })

    await expect(
      needsSupervisedApproval('select_option', { page: 1, element: 2 }, ctx),
    ).resolves.toBe(false)
  })
})

function createContext(options?: {
  elementTarget?: BrowserApprovalTargetSummary | null
  pointTarget?: BrowserApprovalTargetSummary | null
  fullBrowserAccess?: boolean
}): ToolContext {
  return {
    browser: {
      getElementApprovalTarget: async () => options?.elementTarget ?? null,
      getPointApprovalTarget: async () => options?.pointTarget ?? null,
    },
    directories: {},
    session: options?.fullBrowserAccess
      ? { approvalPolicy: { mode: 'full_browser', scope: 'goal_run' } }
      : undefined,
  } as unknown as ToolContext
}
