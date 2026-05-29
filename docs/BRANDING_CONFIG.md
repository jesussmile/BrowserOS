# Private Branding and Configuration Plan

This document defines the phase-1 direction for a private branding and configuration layer. It is intentionally a design plan, not a rebranding pass.

BrowserOS attribution, AGPL-3.0 notices, upstream URLs used for license/history context, and existing copyright headers must remain intact unless legal review approves a specific change.

## Current State

Branding and public configuration are currently spread across the agent extension, server env examples, docs, and assets.

Primary agent touchpoints:

- `packages/browseros-agent/apps/agent/wxt.config.ts`: extension manifest name, toolbar title, update URL, externally connectable hosts, icons, and permissions.
- `packages/browseros-agent/apps/agent/lib/constants/productUrls.ts`: BrowserOS docs, website, repository, policy, community, video, and help URLs.
- `packages/browseros-agent/apps/agent/lib/constants/productWebHost.ts`: BrowserOS web host.
- `packages/browseros-agent/apps/agent/lib/constants/mediaUrls.ts`: public demo media URLs.
- `packages/browseros-agent/apps/agent/assets/product_logo.svg`: product logo asset.
- `packages/browseros-agent/apps/agent/public/icon/`: extension icon assets.
- `packages/browseros-agent/apps/agent/.env.example`: public API, telemetry, and browser binary defaults.
- `packages/browseros-agent/apps/server/.env.example`: server config, telemetry, and install/client ID defaults.

## Private Layer Shape

The first private branding/config layer should be a small typed module consumed by app surfaces that already centralize product metadata.

Initial implementation file:

- `packages/browseros-agent/apps/agent/lib/constants/productConfig.ts`

Recommended future files if the server or shared packages need the same values:

- `packages/browseros-agent/packages/shared/src/private-product-config.ts`
- `packages/browseros-agent/apps/server/src/lib/private-product-config.ts`

Start with values that are safe to commit:

```ts
export interface PrivateProductConfig {
  productName: string
  extensionName: string
  toolbarTitle: string
  productWebHost: string | null
  productWebUrl: string | null
  updateUrl: string | null
  supportUrl: string | null
}
```

Do not include:

- API keys, tokens, credentials, or customer data.
- Provider secrets.
- Private update signing keys.
- Environment-specific endpoints that are not approved for source control.

## Implementation Order

1. Add a typed config module with BrowserOS-compatible defaults and comments marking private override points.
2. Route `wxt.config.ts` manifest strings and update URL through that module.
3. Route `productUrls.ts`, `productWebHost.ts`, and `mediaUrls.ts` through the same module only where it reduces duplication.
4. Add tests for resolved defaults and null/disabled update-channel behavior.
5. Add internal build documentation that states whether update checks are disabled or routed to an approved private channel.

## Update Channel Policy

Private builds must not silently use the BrowserOS public extension update channel.

For early internal builds, prefer `updateUrl: null` so the generated extension has no update URL. Add a private update URL only after the team has an approved hosting, signing, and release process.

For the current agent build, set this before `bun run build:agent` to omit the public BrowserOS extension update URL:

```bash
BROWSEROS_PRIVATE_DISABLE_UPDATE_URL=true bun run build:agent
```

On PowerShell:

```powershell
$env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL='true'
bun run build:agent
Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL
```

## Attribution Policy

Private UI copy can describe the internal product, but BrowserOS attribution must remain available in legal/about surfaces and documentation. Avoid broad search-and-replace changes from `BrowserOS` to a private name.

## Review Checklist

- The change keeps BrowserOS license and attribution notices.
- The change does not add secrets or private user data.
- Defaults still build without private infrastructure.
- The agent build, typecheck, lint, and focused tests pass.
- Install instructions explain whether the build is unpacked, unsigned, or internally packaged.
