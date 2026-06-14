# PannamOS

PannamOS is a private, standalone BrowserOS-derived Chromium browser focused on
local-first AI browser work. It installs side-by-side with official BrowserOS and
uses local provider configuration instead of BrowserOS account login, cloud sync,
or BrowserOS managed app auth.

## Current Status

- Standalone Windows install path: `%LOCALAPPDATA%\PannamOS\Application`
- User data path: `%LOCALAPPDATA%\PannamOS\User Data`
- Local server data path: `%LOCALAPPDATA%\PannamOS\User Data\.pannamos`
- Installed browser binary: `%LOCALAPPDATA%\PannamOS\Application\chrome.exe`
- Installed server binary: `%LOCALAPPDATA%\PannamOS\Application\<version>\PannamOSServer\default\resources\bin\browseros_server.exe`
- ChatGPT Plus/Pro OAuth works locally through the PannamOS server.
- OpenAI API and OpenAI-compatible providers remain available for BYOK use.

## What Is Different From Upstream

PannamOS intentionally does not use:

- BrowserOS login as a default dependency
- BrowserOS cloud sync
- BrowserOS GraphQL as the normal local session store
- BrowserOS managed app auth
- BrowserOS public update channels for private builds
- Public BrowserOS installer or extension artifacts as the default PannamOS path

The Chromium patch layer still contains compatibility names such as
`browseros`, `chrome.browserOS`, `BROWSEROS_*`, and `--browseros-*`. Those are
internal API and upstream porting surfaces, not product branding.

## ChatGPT Plus/Pro Login

ChatGPT Plus/Pro is not the same thing as an OpenAI API key. In PannamOS:

1. Open the assistant or AI settings.
2. Use the ChatGPT Plus/Pro OAuth provider flow.
3. After OAuth succeeds, PannamOS stores the provider locally and selects it
   unless you already configured an explicit API/local provider.
4. No BrowserOS account login is required for chat, sidepanel use, Goal Mode, or
   provider setup.

The local auth status endpoint is:

```powershell
Invoke-RestMethod http://127.0.0.1:9200/oauth/chatgpt-pro/status
```

Expected authenticated shape:

```json
{
  "authenticated": true,
  "provider": "chatgpt-pro"
}
```

## Local Verification

From `packages/browseros-agent`:

```powershell
bun test apps/agent/lib/llm-providers/chatgptDefaultProvider.test.ts apps/agent/lib/llm-providers/providerTemplates.test.ts apps/agent/entrypoints/sidepanel/index/useChatSession.test.ts apps/server/tests/lib/agents/acpx-runtime.test.ts
bun run --filter @browseros/server typecheck
bun run --filter @browseros/agent typecheck
```

For an installed local PannamOS runtime on CDP `9100` and server `9200`:

```powershell
$env:BROWSEROS_CDP_PORT='9100'
$env:BROWSEROS_SERVER_PORT='9200'
bun scripts/verify-live-local-browseros.ts
```

The verifier checks local server health, sidepanel mode wiring, provider routing,
visible PannamOS branding, local app connector behavior, scheduled tasks, and
that extension/service-worker requests stay local.

## Build Notes

Useful local scripts live in `scripts/`:

- `build-pannamos-agent-crx.ps1`
- `build-pannamos-windows-installer.ps1`
- `test-pannamos-side-by-side-install.ps1`
- `test-pannamos-standalone-prereqs.ps1`
- `get-pannamos-build-status.ps1`

Server artifacts are built from `packages/browseros-agent`:

```powershell
bun scripts/build/server.ts --target=windows-x64 --ci
```

## Repository Layout

```text
BrowserOS/
├── packages/browseros/              # Chromium fork and build patches
├── packages/browseros-agent/        # Server, extension, CLI, shared packages
├── scripts/                         # PannamOS build and validation scripts
├── docs/                            # Private runbooks plus upstream docs
└── STANDALONE_BROWSER_PLAN.md       # PannamOS standalone browser plan
```

## Upstream Attribution

PannamOS is derived from BrowserOS. BrowserOS attribution, AGPL-3.0 notices,
upstream URLs used for license/history context, and existing copyright headers
must remain intact unless legal review approves a specific change.

See [LICENSE](LICENSE) for the AGPL-3.0 license.
