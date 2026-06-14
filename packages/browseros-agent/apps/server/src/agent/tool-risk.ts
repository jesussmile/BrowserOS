/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BrowserApprovalTargetSummary } from '../browser/browser'
import type { ToolContext } from '../tools/framework'

export interface SupervisedApprovalDecision {
  required: boolean
  reason?: string
  target?: BrowserApprovalTargetSummary | null
}

const ALWAYS_APPROVAL_REASONS = new Map<string, string>([
  ['upload_file', 'Uploading local files requires approval.'],
  ['download_file', 'Downloading a file to disk requires approval.'],
  ['evaluate_script', 'Running page JavaScript requires approval.'],
  ['delete_history_url', 'Deleting browser history requires approval.'],
  ['delete_history_range', 'Deleting browser history requires approval.'],
  ['remove_bookmark', 'Removing bookmarks requires approval.'],
])

const FORM_CONTROL_TOOLS = new Set(['select_option', 'check', 'uncheck'])
const EDITING_TOOLS = new Set(['fill', 'clear', 'type_at'])

const ACTION_WORDS =
  /\b(submit|send|save|update|change|confirm|continue|finish|done|apply|checkout|purchase|buy|order|pay|subscribe|sign\s*in|log\s*in|login|sign\s*up|register|create\s+account|delete|remove|destroy|deactivate|cancel\s+subscription|close\s+account|upload|post|publish)\b/i

const ACCOUNT_CONTEXT_WORDS =
  /\b(account|profile|settings|security|password|billing|payment|privacy|email|phone|address|subscription|plan|admin|preferences|personal\s+info)\b/i

const SENSITIVE_FIELD_WORDS =
  /\b(password|passcode|2fa|mfa|email|phone|address|card|cvv|ssn|tax|billing|payment|username|login|sign\s*in)\b/i

const ROUTINE_CONSENT_WORDS =
  /\b(cookie|cookies|consent|privacy choices|reject all|accept all|accept selected|accept essential|agree|allow all|save preferences)\b/i

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function boolValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeExpression(expression: string): string {
  return expression
    .trim()
    .replace(/;+\s*$/, '')
    .replace(/\s+/g, '')
}

function stripJavaScriptLiterals(expression: string): string {
  return expression
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

const READ_ONLY_SCRIPT_SOURCES =
  /\b(document|location|window\.location|URL|Node|Element)\b/

const MUTATING_SCRIPT_PATTERNS = [
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i,
  /\b(eval|Function|importScripts?)\s*\(/i,
  /\b(localStorage|sessionStorage|indexedDB|caches|cookie)\b/i,
  /\bnavigator\.clipboard\b/i,
  /\bhistory\.(pushState|replaceState)\s*\(/i,
  /\blocation\.(assign|replace|reload)\s*\(/i,
  /\bdocument\.(write|writeln|open|close)\s*\(/i,
  /\.(click|submit|focus|blur|select|scrollTo|scrollBy|setAttribute|removeAttribute|append|appendChild|prepend|before|after|replaceWith|replaceChildren|insertAdjacentHTML|insertAdjacentElement|insertBefore|remove|removeChild|replaceChild|dispatchEvent)\s*\(/i,
  /\bclassList\.(add|remove|toggle|replace)\s*\(/i,
  /\bstyle\.(setProperty|removeProperty)\s*\(/i,
  /\+\+|--/,
]

function containsAssignment(expression: string): boolean {
  return /(?:^|[^=!<>+\-*/%&|^])=(?:[^=>]|$)|[+\-*/%&|^]=/.test(expression)
}

function isSafeReadOnlyEvaluateScript(args: Record<string, unknown>): boolean {
  const expression = stringValue(args.expression)
  if (!expression) return false

  const normalized = normalizeExpression(expression)
  if (
    normalized === 'document.title' ||
    normalized === 'document.URL' ||
    normalized === 'document.documentURI' ||
    normalized === 'location.href' ||
    normalized === 'location.href.toString()' ||
    normalized === 'location.origin' ||
    normalized === 'location.hostname' ||
    normalized === 'location.pathname' ||
    normalized === '({title:document.title,url:location.href})' ||
    normalized === '({url:location.href,title:document.title})'
  ) {
    return true
  }

  const staticSource = stripJavaScriptLiterals(expression)
  if (!READ_ONLY_SCRIPT_SOURCES.test(staticSource)) return false
  if (containsAssignment(staticSource)) return false

  return !MUTATING_SCRIPT_PATTERNS.some((pattern) => pattern.test(staticSource))
}

function targetText(target?: BrowserApprovalTargetSummary | null): string {
  if (!target) return ''
  return [
    target.text,
    target.ariaLabel,
    target.title,
    target.name,
    target.id,
    target.className,
    target.href,
    target.formAction,
    target.pageUrl,
    target.pageTitle,
    target.type,
    target.role,
  ]
    .filter(Boolean)
    .join(' ')
}

function hasAccountContext(target?: BrowserApprovalTargetSummary | null) {
  return ACCOUNT_CONTEXT_WORDS.test(targetText(target))
}

function hasSensitiveFieldContext(
  target?: BrowserApprovalTargetSummary | null,
) {
  return SENSITIVE_FIELD_WORDS.test(targetText(target))
}

function hasRiskyActionText(target?: BrowserApprovalTargetSummary | null) {
  return ACTION_WORDS.test(targetText(target))
}

function isRoutineConsentTarget(target?: BrowserApprovalTargetSummary | null) {
  return ROUTINE_CONSENT_WORDS.test(targetText(target))
}

async function getElementTarget(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<BrowserApprovalTargetSummary | null> {
  const page = numberValue(args.page)
  const element = numberValue(args.element)
  if (page === undefined || element === undefined) return null
  return ctx.browser.getElementApprovalTarget(page, element)
}

async function getPointTarget(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<BrowserApprovalTargetSummary | null> {
  const page = numberValue(args.page)
  const x = numberValue(args.x)
  const y = numberValue(args.y)
  if (page === undefined || x === undefined || y === undefined) return null
  return ctx.browser.getPointApprovalTarget(page, x, y)
}

function decision(
  required: boolean,
  reason?: string,
  target?: BrowserApprovalTargetSummary | null,
): SupervisedApprovalDecision {
  return { required, reason, target }
}

function classifyClickTarget(
  target: BrowserApprovalTargetSummary | null,
  fallbackReason: string,
): SupervisedApprovalDecision {
  if (!target) {
    return decision(false, fallbackReason, target)
  }

  if (isRoutineConsentTarget(target)) {
    return decision(false, undefined, target)
  }

  if (target.isSubmitControl) {
    return decision(true, 'Submitting a form requires approval.', target)
  }

  if (target.isInForm && hasRiskyActionText(target)) {
    return decision(
      true,
      'This form action may submit or change data and requires approval.',
      target,
    )
  }

  if (hasRiskyActionText(target) && hasAccountContext(target)) {
    return decision(
      true,
      'This may change account, billing, login, or profile settings and requires approval.',
      target,
    )
  }

  if (hasRiskyActionText(target)) {
    return decision(
      true,
      'This action may submit, purchase, publish, delete, or upload data and requires approval.',
      target,
    )
  }

  return decision(false, undefined, target)
}

function classifyFormControlTarget(
  target: BrowserApprovalTargetSummary | null,
): SupervisedApprovalDecision {
  if (!target) {
    return decision(false)
  }

  if (isRoutineConsentTarget(target)) {
    return decision(false, undefined, target)
  }

  if (hasSensitiveFieldContext(target) || hasAccountContext(target)) {
    return decision(
      true,
      'Changing a sensitive or account-related form control requires approval.',
      target,
    )
  }

  if (hasRiskyActionText(target)) {
    return decision(
      true,
      'Changing this control may submit, purchase, publish, delete, or upload data and requires approval.',
      target,
    )
  }

  return decision(false, undefined, target)
}

function classifyEditTarget(
  toolName: string,
  target: BrowserApprovalTargetSummary | null,
): SupervisedApprovalDecision {
  if (!target) {
    return decision(
      true,
      `${toolName} could not verify its target, so approval is required.`,
      target,
    )
  }

  if (hasSensitiveFieldContext(target) || hasAccountContext(target)) {
    return decision(
      true,
      'Changing a sensitive or account-related field requires approval.',
      target,
    )
  }

  return decision(false, undefined, target)
}

export async function getSupervisedApprovalDecision(
  toolName: string,
  params: unknown,
  ctx: ToolContext,
): Promise<SupervisedApprovalDecision> {
  const args = asRecord(params)
  const fullBrowserAccess = ctx.session?.approvalPolicy?.mode === 'full_browser'

  if (fullBrowserAccess) {
    return decision(false)
  }

  if (toolName === 'evaluate_script' && isSafeReadOnlyEvaluateScript(args)) {
    return decision(false)
  }

  const alwaysReason = ALWAYS_APPROVAL_REASONS.get(toolName)
  if (alwaysReason) return decision(true, alwaysReason)

  if (toolName === 'handle_dialog') {
    return boolValue(args.accept)
      ? decision(true, 'Accepting a browser dialog requires approval.')
      : decision(false)
  }

  if (toolName === 'press_key') {
    const key = stringValue(args.key) ?? ''
    return /\benter\b/i.test(key)
      ? decision(
          true,
          'Pressing Enter may submit a form and requires approval.',
        )
      : decision(false)
  }

  if (toolName === 'click') {
    const target = await getElementTarget(ctx, args).catch(() => null)
    return classifyClickTarget(
      target,
      'Click target could not be verified, so it was treated as a routine click.',
    )
  }

  if (toolName === 'click_at') {
    const target = await getPointTarget(ctx, args).catch(() => null)
    if (!target) {
      return decision(
        true,
        'Coordinate click target could not be verified, so approval is required.',
        target,
      )
    }
    return classifyClickTarget(
      target,
      'Coordinate click target could not be verified, so approval is required.',
    )
  }

  if (FORM_CONTROL_TOOLS.has(toolName)) {
    const target = await getElementTarget(ctx, args).catch(() => null)
    return classifyFormControlTarget(target)
  }

  if (EDITING_TOOLS.has(toolName)) {
    const target =
      toolName === 'type_at'
        ? await getPointTarget(ctx, args).catch(() => null)
        : await getElementTarget(ctx, args).catch(() => null)
    return classifyEditTarget(toolName, target)
  }

  return decision(false)
}

export async function needsSupervisedApproval(
  toolName: string,
  params: unknown,
  ctx: ToolContext,
): Promise<boolean> {
  return (await getSupervisedApprovalDecision(toolName, params, ctx)).required
}
