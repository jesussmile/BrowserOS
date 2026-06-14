# PannamOS Standalone Browser Plan

## Issue

The current private BrowserOS setup on Windows is not a separately installable browser.
It launches the official BrowserOS or Chromium host with a private profile, private server,
and private extension through `scripts/launch-private-browseros.ps1`.

That is useful for local validation, but it creates a product identity problem:

- it is easy to confuse the private runtime with the official BrowserOS install
- it does not create a true side-by-side browser install
- it keeps the project on the phase-1 launcher path instead of a standalone browser path
- Goal Mode still behaves like a supervised chat turn instead of a durable autonomous run. Long
  tasks can stop after a few steps and ask the user what to do next.

## What We Intend To Do

We intend to move from the current launcher-based setup to a real standalone private browser
build for Windows named **PannamOS**.

PannamOS is a private BrowserOS-derived browser focused on local-first autonomous browser work:

- long-running Goal Mode
- resumable workflow runs
- local audit logs
- scoped auto-approval for low-risk actions
- explicit approval gates for high-risk actions
- separate install, profile, server, extension, and update identity from BrowserOS

The first milestone is intentionally narrow:

- Windows only
- personal use only
- unsigned build
- manual updates
- no public distribution workflow

If this path works well, the same approach can later be extended to macOS and then to signing
and updater infrastructure.

## Current Constraints

- Browser identity is still hardcoded in the browser build layer.
- Windows install identity is still controlled by the Chromium install patch layer.
- Agent UI labels already have a centralized product config path.
- Full browser packaging requires the Chromium toolchain, Windows build prerequisites, and a
  large local build environment.
- The local session layer now has `local_goal_runs`, queue items, checkpoints, audit events,
  and a server-side Goal Loop runner service.
- Downloads currently need approval by policy. A goal such as "download PDF charts for every
  airport" needs a scoped download grant, otherwise the agent will pause repeatedly.

## Proposed Work

1. Add a browser-side private identity config in the BrowserOS build system.
2. Set the private product identity to PannamOS.
3. Route browser app naming and artifact naming through that config.
4. Update the Windows install identity patch so PannamOS installs side-by-side with
   the official BrowserOS install.
5. Keep the assistant and toolbar branding aligned through the existing agent product config.
6. Add a durable PannamOS Goal Loop runner for long-running tasks.
7. Add continuous-work features inspired by `oh-my-openagent`: auto-continuation,
   todo enforcement, session recovery, planning-before-execution, and durable loop state.
8. Add a scoped auto-approval policy for low-risk browser actions and user-requested downloads.
9. Produce a real Windows installer for the private browser.
10. Validate that the private installer does not replace the official BrowserOS install.
11. Update runbooks and status docs to reflect the standalone build path.

## PannamOS Identity Requirements

PannamOS must not share install identity with BrowserOS.

Required private values:

- Product name: `PannamOS`
- Browser executable/artifact base name: `PannamOS`
- Windows product path name: `PannamOS`
- Windows base app name and app ID: `PannamOS`
- Windows ProgID prefixes: private PannamOS-specific values, not `BOSHTML` or `ChromiumHTM`
- URL scheme: private PannamOS-specific scheme, not `browseros`
- Windows app GUID, Active Setup GUID, toast CLSID, elevator CLSID/IID, tracing CLSID/IID:
  new private GUIDs
- Install directory: a PannamOS path, not `%LOCALAPPDATA%\Chromium\Application`
- User data directory: a PannamOS path, not the official BrowserOS profile
- Server data directory: `.pannamos` under the PannamOS profile, not `.browseros`
- Extension identity: reviewed private extension name/key/update behavior
- Update behavior: no BrowserOS public update channel unless explicitly approved
- Sidecar update behavior: disabled by default; manual opt-in only

## Definition Of Done For Milestone 1

- A Windows installer is generated with the PannamOS browser name.
- Installing it does not overwrite the official BrowserOS install.
- Both official BrowserOS and the private browser can launch independently.
- The assistant and toolbar labels match the PannamOS identity.
- PannamOS has no BrowserOS public browser or extension update URL in the private build.
- PannamOS uses separate install, user-data, server-data, registry, protocol, ProgID, and
  Windows notification identities from BrowserOS.
- Documentation explains the new standalone build path and what is still deferred.

## PannamOS Goal Loop

The way to avoid "it worked for a while, downloaded a few files, then stopped" is not an
unbounded prompt loop. PannamOS needs a durable goal runner that treats the user request as a
tracked job.

Goal Loop architecture:

1. Convert the user request into a goal contract:
   - objective
   - completion criteria
   - allowed actions
   - approval boundaries
   - output location and expected artifacts
2. Break the goal into a durable work queue.
3. Store each item, attempt, result, failure reason, and downloaded artifact in local SQLite.
4. Run the queue in repeatable iterations:
   - pick next pending item
   - act
   - verify
   - save evidence
   - mark done, retry, skipped, or blocked
5. Compact context between iterations so the model does not lose the plan or run out of context.
6. Resume automatically after model/tool/API turn limits until the queue is complete, cancelled,
   or truly blocked.
7. Ask the user only for explicit approval gates, missing credentials, impossible ambiguity, or
   a repeated blocker.
8. Produce a final manifest with completed items, failed items, file paths, source URLs, and
   remaining gaps.

For the airport PDF example, PannamOS should not try to hold "all airports in the world" in one
chat turn. It should:

- build or import a bounded airport list
- create one queue row per airport/chart
- download to a known local folder
- record the source URL and file hash
- retry transient failures
- continue from the last unfinished airport after any restart
- finish with a manifest instead of asking the user after the first few airports

Current implemented slice:

- `PANNAMOS_PRODUCT_IDENTITY` centralizes the browser product name, Windows
  GUIDs, CLSIDs, ProgIDs, and protocol scheme.
- Browser artifact names resolve as `PannamOS_v<version>_<arch>_installer.exe`.
- Chromium branding replacement files now identify the private build as
  PannamOS.
- The Windows install-static patch uses PannamOS install path, app, protocol,
  ProgID, GUID, toast, elevator, and tracing identities.
- `release.windows.pannamos.local.yaml` defines an unsigned local Windows
  installer pipeline.
- `pannamos_server_resources` stages local server resources from the
  BrowserOS-agent/PannamOS-agent build output instead of requiring BrowserOS R2.
- `pannamos_agent_extension` bundles a locally supplied private PannamOS agent
  CRX into Chromium without using the BrowserOS CDN-backed bundled extension
  module.
- The local extension bundle step rewrites the applied Chromium extension
  constants so the PannamOS build expects the private agent extension ID and not
  the upstream BrowserOS agent/bug-reporter/controller extension set.
- `scripts/build-pannamos-agent-crx.ps1` creates/reuses a local private
  extension key outside the repo, builds the agent with the matching public
  manifest key, packs a CRX, and writes a local env helper for installer builds.
- `scripts/setup-pannamos-chromium-env.ps1` prepares local depot_tools and a
  Chromium build env helper outside the repo.
- `compile_windows_installer` builds Chromium `setup.exe` and
  `mini_installer.exe` before packaging.
- The Windows release GN flags explicitly disable Chromium updater for the
  local PannamOS milestone.
- Chromium-side sidecar server patches now use `.pannamos` for runtime state,
  `PannamOSServer` for packaged resources, and inert `pannamos.invalid`
  appcast URLs instead of BrowserOS CDN appcast defaults.
- Chromium-side sidecar updater startup is manual by default and requires
  `--pannamos-enable-server-updater`.
- `scripts/test-pannamos-side-by-side-install.ps1` validates installer naming,
  install-path isolation, official BrowserOS coexistence, executable presence,
  ProgIDs, protocol registration, uninstall entry, optional launch behavior,
  PannamOS profile creation, `.pannamos` server runtime creation, and absence of
  `.browseros` runtime data in the PannamOS profile. It also checks that
  updater download folders are not created by default.
- The private build context defaults extension-manifest lookup to
  `https://browseros.invalid/...` instead of BrowserOS CDN.
- `GoalLoopService` plans a goal contract and durable queue.
- Queue items store action/risk metadata separately from output evidence.
- Low-risk queue items can execute continuously through an injected executor.
- Retryable failures are retried up to the item limit.
- High-risk items pause the goal and record approval state.
- Interrupted runs can resume pending/running queue items.
- Final manifests include completed, skipped, failed, blocked, pending, output paths, source URLs,
  retry counts, and evidence.

Remaining Goal Loop work:

- Add tab cleanup and memory guardrails around long browser runs.
- Improve large natural-language planning beyond URL/list expansion.

Remaining standalone browser work:

- Build or stage local PannamOS server resources before installer builds.
- Build the full Chromium Windows installer using the local PannamOS config.
- Run the full browser installer build with the generated local
  `PANNAMOS_AGENT_CRX` and `PANNAMOS_AGENT_EXTENSION_ID`.
- Provide a real Chromium source checkout so the installer build can actually
  run. Depot_tools is prepared locally; `autoninja`, `gn`, and `ninja` are now
  available from `%LOCALAPPDATA%\PannamOS\depot_tools`.
- Validate side-by-side install against official BrowserOS on Windows.
- Verify install path, profile path, server data path, registry entries,
  uninstall entries, protocols, ProgIDs, GUIDs, and launch behavior.

## Continuous Work Features To Adapt

PannamOS should borrow the proven harness ideas from
[`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent) as native browser features,
not by embedding that project directly.

Features to adapt:

- `ulw-loop` / Ralph Loop pattern: continue automatically when the model stops before the goal
  is complete.
- Todo enforcer: if unfinished queue items remain and the agent becomes idle, resume or create a
  checkpoint instead of silently stopping.
- Start-work planner: create a goal contract and execution plan before acting on large tasks.
- Session recovery: recover from context limits, model errors, malformed tool results, and
  browser/runtime failures.
- Durable loop state: persist queue items, checkpoints, evidence, and continuation decisions in
  local SQLite instead of temporary prompt context.
- Handoff summary: generate a compact state summary that can continue in a fresh model session.
- Scoped skills: load task-specific instructions and tools only when relevant, such as an airport
  chart collection skill.

Do not copy `oh-my-openagent` source code into PannamOS without license review. Its published
license is not a simple permissive license, and PannamOS should keep this as a design reference
unless legal review approves direct reuse.

## Goal Loop Approval Policy

Goal Mode should auto-approve routine actions:

- navigation
- reading pages
- scrolling
- opening and closing task tabs
- clicking non-risky links, menus, filters, and cookie choices
- selecting non-sensitive filters
- read-only page inspection

Goal Mode should support scoped pre-approval from the user's original request:

- If the user asks to download files, allow downloads that match the goal scope, file type, and
  destination folder.
- For example, "download PDF charts for all airports" can grant PDF downloads into the goal's
  output folder, while still requiring approval for uploads, purchases, account changes, or
  credential entry.

Goal Mode must still pause for high-risk actions:

- submitting forms
- purchases or payments
- deleting data
- uploading local files
- sending messages or public posts
- logging in or entering credentials
- changing account, billing, security, or profile settings
- running page JavaScript that mutates page or browser state

## Goal Loop Guardrails

PannamOS should continue until the result is reached, but it should not spin forever.

Each goal run needs explicit guardrails:

- max runtime
- max iterations
- max retries per item
- max open tabs
- max disk usage
- allowed domains when the source is known
- cancellation button
- pause/resume controls
- progress UI
- local audit log
- final manifest

When a goal reaches a guardrail, PannamOS should save state and report what is needed to continue,
not lose progress.

## Deferred Work

The following are explicitly out of scope for this first milestone:

- code signing
- private update channel
- public distribution
- macOS packaging
- multi-platform release automation
- cloud sync for goal runs
- public PannamOS update infrastructure

## Key Ownership Points

- `packages/browseros/build/common/context.py`
- `packages/browseros/build/modules/package/windows.py`
- `packages/browseros/chromium_patches/chrome/install_static/chromium_install_modes.h`
- `packages/browseros/chromium_files/chrome/app/theme/chromium/BRANDING.release`
- `packages/browseros/build/config/copy_resources.yaml`
- `packages/browseros-agent/apps/agent/lib/constants/productConfig.ts`
- `packages/browseros-agent/apps/agent/wxt.config.ts`
- `packages/browseros-agent/apps/server/src/agent/mode-instructions.ts`
- `packages/browseros-agent/apps/server/src/agent/tool-risk.ts`
- `packages/browseros-agent/apps/server/src/api/services/local-session-service.ts`
- `packages/browseros-agent/apps/server/src/lib/db/migrations/0003_private_local_sessions.sql`
- `docs/PHASE1_STATUS.md`
- `docs/INSTALL_RUNBOOK.md`
- `docs/BRANDING_CONFIG.md`

## Next Step

Implement the next PannamOS standalone slice:

1. Source `%LOCALAPPDATA%\PannamOS\extension-artifacts\pannamos-agent-env.ps1`.
2. Confirm local server resources exist under
   `packages/browseros-agent/dist/prod/server/windows-x64/resources`.
3. Fetch/sync Chromium source at `C:\src\chromium\src` or provide another
   valid `CHROMIUM_SRC`.
4. Build `PannamOS_v<version>_x64_installer.exe` with
   `scripts/build-pannamos-windows-installer.ps1`.
5. Install PannamOS side-by-side with official BrowserOS.
6. Validate separate install/profile/server/registry/protocol/ProgID identities
   with `scripts/test-pannamos-side-by-side-install.ps1 -Install -Launch`.
7. Continue the standalone Windows installer work until PannamOS installs side-by-side with
   official BrowserOS.
