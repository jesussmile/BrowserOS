# Phase 1 Status

Last updated: 2026-06-02.

This document records what has been done in this private BrowserOS mirror so the team can restart work without relying on chat history. It is an operational status document, not a release note and not an upstream contribution plan.

## Current Local Checkout

The active private working copy is:

```text
C:\Users\pannam\Desktop\BrowserOS
```

The earlier working copy still exists at:

```text
C:\Users\pannam\Documents\BrowserOS
```

The Desktop copy was created after the user asked to move the project to the Desktop. A true move/delete of the Documents copy was blocked because the running Codex session and Node/Bun processes had files open under that directory. Treat the Desktop copy as canonical for new work. The old Documents copy can be removed later after BrowserOS, Bun, Node, and Codex processes that reference it are closed.

The legacy private development launcher runtime data lives under:

```text
%LOCALAPPDATA%\BrowserOS-Private
%LOCALAPPDATA%\BrowserOS-Private\profile
%LOCALAPPDATA%\BrowserOS-Private\data
%LOCALAPPDATA%\BrowserOS-Private\logs
```

That launcher still exists for extension/server development, but it is no longer
the only private runtime.

As of 2026-06-02, a standalone PannamOS Windows installer has been built,
packaged, installed, and launched from this repository:

```text
packages\browseros\dist\PannamOS_v0.46.2_x64_installer.exe
packages\browseros\dist\PannamOS_v0.46.2_x64_installer.zip
```

Installed PannamOS evidence:

```text
%LOCALAPPDATA%\PannamOS\Application\chrome.exe
%LOCALAPPDATA%\PannamOS\Application\148.0.7925.97\PannamOSServer\default\resources\bin\browseros_server.exe
%LOCALAPPDATA%\PannamOS\User Data
%LOCALAPPDATA%\PannamOS\User Data\.pannamos
```

The installed PannamOS browser is separate from the older official
BrowserOS/Chromium install path at `%LOCALAPPDATA%\Chromium\Application`.

## Standalone PannamOS Build Target Progress

The repo now has a first standalone Windows installer build target for PannamOS:

```text
packages/browseros/build/config/release.windows.pannamos.local.yaml
```

This config is intended for an unsigned, manually updated, local Windows build.
It runs the PannamOS browser identity/resource/patch path, builds the browser,
builds `setup.exe` and `mini_installer.exe`, and packages the output as:

```text
PannamOS_v<version>_x64_installer.exe
```

Build-system changes added for this target:

- `packages/browseros/build/common/product_identity.py` remains the central
  PannamOS browser identity source for product name, Windows GUIDs, CLSIDs,
  ProgIDs, and protocol scheme.
- `packages/browseros/build/common/context.py` now uses PannamOS artifact names
  and defaults bundled-extension manifest lookup to an inert private URL instead
  of BrowserOS CDN.
- `packages/browseros/build/modules/compile/standard.py` now exposes
  `compile_windows_installer` to build Chromium `setup` and `mini_installer`.
- `packages/browseros/build/cli/build.py` registers `compile_windows_installer`.
- `packages/browseros/build/modules/resources/pannamos_server_resources.py`
  stages locally built server resources from the BrowserOS-agent/PannamOS-agent
  build output instead of downloading BrowserOS R2 artifacts.
- `packages/browseros/build/modules/extensions/pannamos_agent_extension.py`
  bundles a locally supplied private PannamOS agent CRX and rewrites the
  Chromium bundled-extension GN sources to include only that agent extension.
  It also rewrites the applied Chromium `browseros_constants.h` to use the
  private PannamOS agent extension ID and remove the upstream BrowserOS bug
  reporter/controller extension IDs from the PannamOS extension list.
- `packages/browseros/chromium_patches/chrome/install_static/chromium_install_modes.h`
  contains PannamOS install-static values for side-by-side Windows identity.
- Chromium-side sidecar server patches now use `.pannamos` for runtime state,
  `PannamOSServer` for packaged resources, and inert `pannamos.invalid`
  appcast URLs instead of BrowserOS CDN appcast defaults.
- Chromium-side sidecar updater startup is manual by default. It does not start
  unless `--pannamos-enable-server-updater` is explicitly supplied, and the
  existing disable switch still wins if both are present.

The local Windows build config intentionally does not include:

- `sign_windows`
- `upload`
- `bundled_extensions`
- `download_resources`

The Windows release GN flags now explicitly set:

```text
enable_updater=false
```

This keeps the local PannamOS installer build out of BrowserOS/Chromium public
updater behavior for milestone 1.

The local Windows build now stages server resources from
`packages/browseros-agent/dist/prod/server/windows-x64/resources` by default and
requires:

- `PANNAMOS_AGENT_CRX`: locally packed PannamOS agent `.crx`
- `PANNAMOS_AGENT_EXTENSION_ID`: private Chrome extension ID for that CRX

The agent build supports `PANNAMOS_AGENT_EXTENSION_KEY` so the built
`manifest.json` can contain the public key that matches the private CRX signing
key. The private key itself must stay outside the repo. This removes BrowserOS
R2 and BrowserOS CDN extension bundle paths from the PannamOS installer config,
but the current private CRX process is still local/manual. A formal reviewed
extension packing/signing process is still needed before external distribution.

Local private extension CRX evidence captured on 2026-06-02:

- Helper: `scripts/build-pannamos-agent-crx.ps1`
- Private key path: `%LOCALAPPDATA%\PannamOS\extension-key\pannamos-agent.pem`
- CRX path: `%LOCALAPPDATA%\PannamOS\extension-artifacts\pannamos-agent-omafobdjppghabboefpchoelhdkekbfp.crx`
- Env helper: `%LOCALAPPDATA%\PannamOS\extension-artifacts\pannamos-agent-env.ps1`
- Private extension ID: `omafobdjppghabboefpchoelhdkekbfp`
- Verification: CRX ID, `PANNAMOS_AGENT_EXTENSION_ID`, and the built
  `manifest.json` key all derived to the same private extension ID.
- No private key contents, CRX, or generated env helper were committed to the repo.

Standalone preflight command:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\test-pannamos-standalone-prereqs.ps1
```

Current preflight result on 2026-06-02:

- Passed: extension env helper loads
- Passed: Chromium build env helper loads
- Passed: `PANNAMOS_AGENT_CRX` exists
- Passed: `PANNAMOS_AGENT_EXTENSION_ID` is valid
- Passed: CRX extension ID matches env ID
- Passed: local Windows server resources exist
- Passed: `autoninja` from `%LOCALAPPDATA%\PannamOS\depot_tools`
- Passed: `gn` from `%LOCALAPPDATA%\PannamOS\depot_tools`
- Passed: `ninja` from `%LOCALAPPDATA%\PannamOS\depot_tools`
- Passed: Chromium source checkout at `C:\src\chromium\src`

Depot_tools setup command already run:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\setup-pannamos-chromium-env.ps1
```

The large Chromium checkout was completed on 2026-06-02. To repeat it on a
fresh machine:

```powershell
.\scripts\setup-pannamos-chromium-env.ps1 -FetchChromium
```

Current fetch evidence captured on 2026-06-02:

- Chromium fetch was started into `C:\src\chromium`.
- Fetch process PID file: `%LOCALAPPDATA%\PannamOS\logs\chromium-fetch.pid`
- Fetch stdout/stderr logs: `%LOCALAPPDATA%\PannamOS\logs\chromium-fetch-*.log`
- `scripts/setup-pannamos-chromium-env.ps1 -FetchChromium` now resumes a
  partial `.gclient` checkout with `gclient sync --nohooks` if the initial
  fetch is interrupted before `src` exists.
- Monitor command:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\get-pannamos-chromium-fetch-status.ps1
```

Fetch result captured on 2026-06-02:

- `C:\src\chromium\src` exists and passed standalone preflight.
- Fetch logs were written under `%LOCALAPPDATA%\PannamOS\logs`.
- The helper can still resume interrupted `.gclient` checkouts with
  `gclient sync --nohooks`.

The wrapper for the eventual installer build is:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\build-pannamos-windows-installer.ps1
```

Build monitor command:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\get-pannamos-build-status.ps1
```

Pass `-ChromiumSrc <path-to-chromium-src>` only when using a non-default
checkout. The default comes from
`%LOCALAPPDATA%\PannamOS\chromium-build-env.ps1`.

Side-by-side installer validation script:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\test-pannamos-side-by-side-install.ps1 -Install -Launch
```

This checks installer naming, PannamOS install path, Chromium path isolation,
official BrowserOS coexistence when installed, executable presence, installed
`PannamOSServer` sidecar resources, absence of `BrowserOSServer` resources in
the PannamOS install, ProgIDs, protocol registration, uninstall entry, optional
launch behavior, PannamOS profile creation, `.pannamos` server runtime
creation, and absence of `.browseros` runtime data in the PannamOS profile. It
also checks that sidecar updater `versions` and `pending_update` folders are not
created by default.

Current standalone install validation result on 2026-06-02:

- Passed: installer artifact name `PannamOS_v0.46.2_x64_installer.exe`
- Passed: installer exited successfully
- Passed: install path `%LOCALAPPDATA%\PannamOS\Application`
- Passed: install path is separate from `%LOCALAPPDATA%\Chromium\Application`
- Passed: executable exists at `%LOCALAPPDATA%\PannamOS\Application\chrome.exe`
- Passed: `PannamOSServer` resources are installed under the version directory
- Passed: `BrowserOSServer` resources are absent from the PannamOS install
- Passed: `PannamOSHTML.<suffix>` and `PannamOSPDF.<suffix>` ProgIDs exist
- Passed: `pannamos` protocol is registered
- Passed: PannamOS uninstall entry exists
- Passed: PannamOS uninstall `DisplayName` is `PannamOS`
- Passed: launch with `%LOCALAPPDATA%\PannamOS\User Data`
- Passed: `.pannamos` runtime path exists and `.browseros` runtime path is absent
- Passed: sidecar updater `versions` and `pending_update` paths are absent by
  default
- Warning: official `%LOCALAPPDATA%\BrowserOS\Application` was not present on
  this machine for that specific side-by-side comparison. An older official
  BrowserOS install path under `%LOCALAPPDATA%\Chromium\Application` still
  exists independently.

Validation added:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros
python -m unittest build.common.product_identity_test
python -m unittest build.modules.resources.pannamos_server_resources_test
python -m unittest build.modules.extensions.pannamos_agent_extension_test
python -m build.browseros build --list
cd ..\browseros-agent
bun test apps/agent/lib/constants/productConfig.test.ts
```

Current result on 2026-06-02:

- product identity tests passed
- PannamOS server resource staging tests passed
- PannamOS agent extension bundling tests passed
- agent product-config tests passed
- CLI lists `compile_windows_installer` under Build
- Windows release flags are tested to keep `enable_updater=false`
- Chromium-side sidecar paths/appcast defaults are tested for `.pannamos`,
  `PannamOSServer`, and no BrowserOS CDN appcast URL
- Chromium-side sidecar updater startup is tested as manual opt-in
- full Chromium browser and Windows installer build completed once on
  2026-06-02

Build failures fixed during the first cold Chromium build:

- `browser_os.idl` / `side_panel.idl` CRLF parse failure: normalized patch and
  applied IDL files to LF.
- Truncated applied BrowserOS headers/source in the Chromium checkout:
  restored missing namespace/header-guard endings in
  `browseros_switches.h`, `browseros_server_manager.cc`, and
  `browseros_server_constants.h`. The repo patch sources already contain the
  closing lines.
- Current Chromium removed `base/win/wincrypt_shim.h`: changed the BrowserOS
  Chrome importer patch to use `<windows.h>` and `<wincrypt.h>`.
- Installer archive still referenced `BrowserOSServer`: changed
  `chrome/installer/mini_installer/chrome.release` to package
  `PannamOSServer`.

Incremental build rule:

- Do not rerun the full wrapper for normal iteration if it would clean
  `out\Default_x64`.
- For sidepanel, server, provider, Goal Loop, and UI work, rebuild/test the
  agent or server only.
- For Chromium C++/IDL/resource changes, use incremental `autoninja.bat -C
  out\Default_x64 <target>`.
- For installer packaging changes, use incremental `autoninja.bat -C
  out\Default_x64 setup mini_installer`, then refresh the dist artifact.

## Private Fork Position

This repo is a private mirrored derivative of BrowserOS, not a public GitHub fork and not an upstream contribution branch.

Rules we have kept in place:

- No upstream pull requests were opened.
- No upstream copyright, license, AGPL, or attribution notices were removed.
- No secrets, API keys, provider tokens, credentials, or user data were added to source control.
- Full Chromium rebuild work was intentionally avoided for phase 1.
- Work stayed focused on the BrowserOS agent, local server, docs, and local validation path.

See [PRIVATE_FORK.md](PRIVATE_FORK.md) for the permanent private mirror policy and upstream sync commands.

## Repository Foundation Added

The private foundation docs now cover:

- Private mirror policy and upstream sync workflow in [PRIVATE_FORK.md](PRIVATE_FORK.md).
- Product direction, milestones, local-first API shape, and branding touchpoints in [PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md).
- Development, validation, local-only checks, packaging checks, and troubleshooting in [DEV_RUNBOOK.md](DEV_RUNBOOK.md).
- Install and launcher history in [INSTALL_RUNBOOK.md](INSTALL_RUNBOOK.md).
- Branding/configuration placeholder strategy in [BRANDING_CONFIG.md](BRANDING_CONFIG.md).
- BYOK provider setup and secret hygiene in [PROVIDER_RUNBOOK.md](PROVIDER_RUNBOOK.md).

The docs preserve BrowserOS attribution and keep product work framed as a private AGPL derivative until legal review says otherwise.

## Agent Build Baseline

The BrowserOS agent package is:

```text
packages\browseros-agent
```

The package manager is Bun, pinned by `packages/browseros-agent/package.json`:

```text
bun@1.3.6
```

Baseline work already completed:

- Installed Bun locally at `C:\Users\pannam\.bun\bin\bun.exe`.
- Ran `bun install` in `packages\browseros-agent`.
- Built the agent extension with `bun run build:agent`.
- Confirmed `bun run typecheck` passed during the baseline pass.
- Confirmed `bun run lint` passed during the baseline pass, with existing warnings.
- Confirmed `bun run build:server:ci` passed during the baseline pass.
- Avoided `bun run build` for production server output because it requires production configuration such as codegen, telemetry, Sentry, and upload settings. No fake values were added.

Known environment notes:

- Node was present as `v22.11.0`.
- Python was present as `Python 3.12.3`.
- Go was not installed or not on `PATH` during the baseline pass, so Go CLI/package tests were not run.
- Full browser build prerequisites were not present and were intentionally not pursued.

## Official BrowserOS Host Install

The official BrowserOS Windows installer was used only as a local validation host.

Observed official install:

- BrowserOS app version: `0.44.0.1`.
- Chromium version: `146.0.7821.31`.
- Install location: `%LOCALAPPDATA%\Chromium\Application`.
- Upstream bundled Assistant extension version: `0.0.102.0`.
- Upstream bundled extension update URL: `https://cdn.browseros.com/extensions/update-manifest.xml`.

A clean official reinstall was also performed on 2026-05-30:

- Existing BrowserOS user data was backed up before reset.
- BrowserOS was uninstalled with the registered Windows user-level uninstaller.
- The upstream installer was downloaded again from GitHub Releases.
- Authenticode signature was valid and signed by `Felafax, Inc.`
- Health check for the official local server passed at `http://127.0.0.1:9200/health`.

The clean official profile did not include our private patched extension by default.

## Private Patched Runtime

The current private runtime is launched by:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1
```

The launcher starts:

- BrowserOS/Chromium host from `%LOCALAPPDATA%\Chromium\Application\chrome.exe`.
- Private profile under `%LOCALAPPDATA%\BrowserOS-Private\profile`.
- Private server on `http://127.0.0.1:9105`.
- Chrome DevTools Protocol on port `9005`.
- Extension port `9305`.
- Patched unpacked extension from `packages\browseros-agent\apps\agent\dist\chrome-mv3`.

Important launcher flags:

- `--disable-browseros-server`
- `--disable-browseros-extensions`
- `--browseros-mcp-port=9105`
- `--browseros-server-port=9105`
- `--browseros-extension-port=9305`
- `--browseros-extensions-url=https://browseros.invalid/extensions.json`
- `--browseros-disable-url-overrides`
- `--disable-extensions-except=<private extension dist>`
- `--load-extension=<private extension dist>`
- `about:blank`

This runtime intentionally avoids the official managed extension/update path and loads only the private extension build.

Server logs are written to:

```text
%LOCALAPPDATA%\BrowserOS-Private\logs\server.out.log
%LOCALAPPDATA%\BrowserOS-Private\logs\server.err.log
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:9105/health
```

Expected healthy result includes:

```json
{"status":"ok","cdpConnected":true}
```

## Screenshot and Diagnosis Tooling

The helper script for screenshots is:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\capture-private-browseros.ps1
```

It supports:

- Real top-level BrowserOS window capture across monitors.
- CDP page screenshots with `captureBeyondViewport=true`.
- Combined mode that captures both window and page targets.

Default output directory:

```text
%TEMP%\codex-browseros-screenshots
```

This script was added because the user's BrowserOS window was often on a smaller or secondary screen and normal desktop screenshots did not reliably capture the full window.

## Local-First Product Work

The private product plan is local-first:

- No BrowserOS account should be required for normal local use.
- BrowserOS cloud sync should not be the default source of truth.
- Chats, sessions, goal runs, and audit events should live locally on the PC.
- Provider access should be separate from upstream account login.
- No built-in provider API keys should exist in source code.

Implemented local SQLite tables:

- `local_sessions`
- `local_session_messages`
- `local_goal_runs`
- `local_goal_queue_items`
- `local_goal_checkpoints`
- `local_audit_events`

Implemented local API surface includes:

- `GET /local/agent-capabilities`
- `GET /local/agent-skills`
- `GET /local/sessions`
- `POST /local/sessions`
- `GET /local/sessions/:id`
- `PATCH /local/sessions/:id`
- `DELETE /local/sessions/:id`
- `POST /local/sessions/:id/messages`
- `GET /local/sessions/:id/audit`
- `POST /local/audit`
- `POST /local/goals`
- `POST /local/goals/plan`
- `POST /local/goals/resume-unfinished`
- `GET /local/goals/:id`
- `GET /local/goals/:id/manifest`
- `GET /local/goals/:id/queue`
- `POST /local/goals/:id/queue`
- `PATCH /local/goals/:id/queue/:itemId`
- `POST /local/goals/:id/checkpoints`
- `POST /local/goals/:id/run`
- `POST /local/goals/:id/resume`
- `POST /local/goals/:id/cancel`

Implemented UI/runtime behavior includes:

- Sidepanel history reads from local sessions instead of upstream GraphQL history.
- Existing extension-stored conversations migrate into SQLite when the local server is available.
- Local audit metadata is written for browser tool executions.
- Chat, Research, Workflow, and Goal modes are available as private local modes.
- The selected mode is sent to the local chat route and created-agent sidepanel route.
- Chat mode is observe-only and should not expose external/custom MCP tools.
- Local app catalog entries can be connected to loopback MCP URLs.
- Remote MCP URLs are not treated as live tools in this private build.
- Upstream/Klavis cloud app auth routes return local catalog or disabled responses instead of upstream cloud auth URLs.

Verification scripts added or used:

```bash
cd packages/browseros-agent
bun run verify:local-only
bun run verify:live-local
```

`verify:live-local` exercises the live private browser/server through CDP and fails if runtime surfaces call BrowserOS cloud hosts during normal local use.

## Provider and Login Notes

BrowserOS account login and model/provider login are separate concepts.

What we observed:

- The official BrowserOS account/cloud path caused repeated login and session persistence confusion.
- ChatGPT Plus/Pro mode displayed `Not authenticated with ChatGPT Plus/Pro. Please login first.` even after the user authenticated in some cases.
- The private direction is to remove BrowserOS account login as a default dependency and make provider setup explicit.

Current stance:

- Do not hardcode OpenAI, Anthropic, ChatGPT, or BrowserOS provider credentials.
- Treat provider credentials as user/runtime configuration only.
- Keep prompts clear about where data is sent.
- Expose only OpenAI and OpenAI-compatible BYOK provider setup paths for v1.
- Prefer local provider options such as Ollama/LM Studio later only after review and tests.

Remaining product work:

- Build clearer provider settings copy and validation for OpenAI/OpenAI-compatible providers.
- Store user provider configuration locally without committing secrets.
- Make the UI clearly distinguish local BrowserOS sessions from provider authentication.

## Goal Mode and Approval Behavior

Goal Mode now has a native server-side Goal Loop runner foundation. It plans a durable goal contract and queue, executes low-risk queue items through an injected executor, retries failures, checkpoints progress, resumes unfinished work, pauses before high-risk actions, and generates a final manifest.

Observed issues:

- The agent asks for approval for many browser actions, including low-risk clicks and evaluate-script actions.
- The user wants autonomous operation until the goal is complete, while still preventing risky actions.
- Stale approval state sometimes produced errors such as `No pending tool approval matched this response. Retry the action from the current chat state.`

Implemented mitigation:

- Added `sanitizeIncompleteToolCalls` in `packages/browseros-agent/apps/server/src/agent/message-validation.ts`.
- Integrated it into `packages/browseros-agent/apps/server/src/api/services/chat-service.ts`.
- Added targeted tests in `packages/browseros-agent/apps/server/tests/agent/message-validation.test.ts`.
- Added `GoalLoopService` in `packages/browseros-agent/apps/server/src/api/services/goal-loop-service.ts`.
- Added local route support for `/local/goals/plan`, `/local/goals/:id/run`, `/local/goals/resume-unfinished`, and `/local/goals/:id/manifest`.
- Added focused tests in `packages/browseros-agent/apps/server/tests/api/services/goal-loop-service.test.ts` and route coverage in `packages/browseros-agent/apps/server/tests/api/routes/local.test.ts`.

Validation evidence:

```bash
cd packages/browseros-agent
bun test packages/browseros-agent/apps/server/tests/agent/message-validation.test.ts
bun run --filter @browseros/server typecheck
```

Both passed when run after the fix.

Remaining work:

- Wire the Goal Loop runner into the sidepanel Goal Mode UI.
- Add a production browser/tool executor for queue items; the current runner is executor-driven and tested with injected executors.
- Continue requiring user approval for risky actions such as submitting forms, purchases, deletions, uploads, account setting changes, credential entry, or login/account actions.
- Record every tool/action decision in the local audit log.
- Close or recycle task-created tabs when a goal completes.

## Out-of-Memory Investigation

The user repeatedly saw Chromium `Aw, Snap!` pages with `Error code: Out of Memory`.

Observed pattern:

- The crash appeared even when only a few visible tabs were open.
- It often happened around Assistant/Goal activity or extension pages.
- PannamOS showed `PannamOS Agent is installing/updating` at times, which indicated the extension/runtime path was not stable.
- Some pages under automation can be heavy even when the visible tab count is low.

Mitigations already applied:

- The private launcher starts on `about:blank` instead of extension-backed new tab/onboarding.
- The private launcher disables BrowserOS URL overrides for this dev-loaded setup.
- The private launcher disables the managed BrowserOS extension path and loads the patched extension directly.
- The private launcher uses `--disable-extensions-except` so stale/official extension state does not compete with the patched extension.
- Breakpad/crash reporter/session crashed bubble are disabled for local debugging noise reduction.

Remaining work:

- Add memory-aware agent behavior: cap open tabs, reuse tabs, close task-created tabs on completion, and avoid repeated page/script snapshots when the page is already known.
- Add watchdog diagnostics that report active tab count, extension service worker state, and server health before/after Goal runs.
- Add a browser-side command to capture full-page/current-window diagnostics for Codex without depending on the screen layout.
- Investigate extension-side memory growth if OOM continues with only the private extension loaded.

## BrowserOS Agent Installing/Updating Message

Problem seen by the user:

```text
PannamOS Agent is installing/updating. Please try again shortly.
```

Likely cause:

- The official BrowserOS managed extension/update path and the unpacked patched extension path were competing or the profile was waiting on the managed extension state.

Fix applied:

- Updated `scripts\launch-private-browseros.ps1` to disable the managed BrowserOS extension path.
- Added `--disable-extensions-except=<private extension dist>`.
- Kept `--load-extension=<private extension dist>`.
- Pointed BrowserOS extension update/config fallback to `https://browseros.invalid/extensions.json`.

Expected behavior now:

- Starting through `scripts\launch-private-browseros.ps1` should load the patched private Assistant extension directly.
- If the message returns, restart the private runtime and check the health endpoint and server logs under `%LOCALAPPDATA%\BrowserOS-Private\logs`.

## What Is Still Not Finished

High priority:

- Finish a private auto-approval policy for Goal Mode.
- Add tab cleanup and memory controls for long-running goals.
- Make session restore/history obvious in the UI.
- Add a first-class local provider configuration screen.
- Add installed-PannamOS smoke coverage for chat, Goal Mode, provider setup,
  extension title, toolbar title, and local-only cloud checks.

Medium priority:

- Improve screenshot/diagnostic reporting from inside BrowserOS itself.
- Add a visible local-only/privacy status indicator.
- Add export/backup for local sessions.
- Add clearer migration status for old extension-stored conversations.
- Add more tests around Goal Mode completion, blocked state, approvals, and tab cleanup.

Deferred:

- Public release.
- Broad rebranding beyond the current standalone Windows identity layer.
- External distribution without legal review.

## Current Restart Commands

Start private BrowserOS:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1
```

Start only the private server:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1 -ServerOnly
```

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:9105/health
```

Capture BrowserOS:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\capture-private-browseros.ps1
```

Rebuild private extension:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros-agent
$env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL='true'
$env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE='true'
bun run build:agent
Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL
Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE
```

Run targeted stale-tool validation:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros-agent
bun test packages/browseros-agent/apps/server/tests/agent/message-validation.test.ts
bun run --filter @browseros/server typecheck
```

## Next Recommended Codex Goal

Implement a private Goal Mode autonomy policy:

- Auto-approve low-risk actions during Goal Mode.
- Require approval for high-risk actions.
- Record every action and approval decision in local audit events.
- Reuse or close task-created tabs when the goal completes.
- Add memory guardrails so the browser does not crash during multi-page research tasks.
- Add tests and live validation evidence.
