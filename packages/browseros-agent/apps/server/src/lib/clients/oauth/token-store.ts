/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { and, desc, eq } from 'drizzle-orm'
import type { BrowserOsDatabase } from '../../db'
import { type OAuthTokenRow, oauthTokens } from '../../db/schema'
import type {
  OAuthStatus,
  OAuthTokenStore as OAuthTokenStoreContract,
  StoredOAuthTokens,
} from './token-manager'

/** Persists OAuth tokens in the local PannamOS Drizzle database for server-managed LLM providers. */
export class OAuthTokenStore implements OAuthTokenStoreContract {
  constructor(private readonly db: BrowserOsDatabase) {}

  upsertTokens(
    browserosId: string,
    provider: string,
    tokens: StoredOAuthTokens,
  ): void {
    const row: OAuthTokenRow = {
      browserosId,
      provider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      email: tokens.email ?? null,
      accountId: tokens.accountId ?? null,
      updatedAt: Date.now(),
    }
    this.db
      .insert(oauthTokens)
      .values(row)
      .onConflictDoUpdate({
        target: [oauthTokens.browserosId, oauthTokens.provider],
        set: row,
      })
      .run()
  }

  getTokens(browserosId: string, provider: string): StoredOAuthTokens | null {
    const row = this.findRowOrAdopt(browserosId, provider)
    if (!row) return null
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      email: row.email ?? undefined,
      accountId: row.accountId ?? undefined,
    }
  }

  deleteTokens(_browserosId: string, provider: string): void {
    this.db.delete(oauthTokens).where(eq(oauthTokens.provider, provider)).run()
  }

  getStatus(browserosId: string, provider: string): OAuthStatus {
    const row = this.findRowOrAdopt(browserosId, provider)
    return {
      authenticated: row !== null,
      email: row?.email ?? undefined,
      provider,
    }
  }

  private findRow(browserosId: string, provider: string): OAuthTokenRow | null {
    return (
      this.db
        .select()
        .from(oauthTokens)
        .where(tokenKey(browserosId, provider))
        .get() ?? null
    )
  }

  private findRowOrAdopt(
    browserosId: string,
    provider: string,
  ): OAuthTokenRow | null {
    const exact = this.findRow(browserosId, provider)
    if (exact) return exact

    const latest = this.findLatestProviderRow(provider)
    if (!latest) return null

    const adopted: OAuthTokenRow = {
      ...latest,
      browserosId,
      updatedAt: Date.now(),
    }
    this.db
      .insert(oauthTokens)
      .values(adopted)
      .onConflictDoUpdate({
        target: [oauthTokens.browserosId, oauthTokens.provider],
        set: adopted,
      })
      .run()
    return adopted
  }

  private findLatestProviderRow(provider: string): OAuthTokenRow | null {
    return (
      this.db
        .select()
        .from(oauthTokens)
        .where(eq(oauthTokens.provider, provider))
        .orderBy(desc(oauthTokens.updatedAt))
        .limit(1)
        .get() ?? null
    )
  }
}

function tokenKey(browserosId: string, provider: string) {
  return and(
    eq(oauthTokens.browserosId, browserosId),
    eq(oauthTokens.provider, provider),
  )
}
