# Development Runbook

This runbook focuses on the BrowserOS agent and repository foundation. Do not attempt a full Chromium browser build unless the large Chromium checkout and platform toolchain are already available.

## Repository Map

- `packages/browseros-agent`: agent monorepo, Bun workspace, server, extension UI, CLI, evals, and shared packages.
- `packages/browseros`: Chromium fork build tooling, Python package, Chromium patches, resources, signing, and packaging.
- `docs/`: upstream user-facing documentation plus private fork foundation notes.

## Current Local Checkout

Use the Desktop copy for all new private BrowserOS work:

```text
C:\Users\pannam\Desktop\BrowserOS
```

An older copy may still exist at:

```text
C:\Users\pannam\Documents\BrowserOS
```

The older copy was left in place because running Codex/Node/Bun processes had files open when the project was copied to the Desktop. Do not make new edits there unless the Desktop copy is intentionally replaced.

For the full implementation history and current open issues, see [PHASE1_STATUS.md](PHASE1_STATUS.md).

## Package Managers and Tooling

Agent:

- Package manager: Bun, pinned by `packages/browseros-agent/package.json` as `bun@1.3.6`.
- Lockfiles: `packages/browseros-agent/bun.lock` and `packages/browseros-agent/bun.lockb`.
- Node/npm/yarn/pnpm are explicitly discouraged by the agent package `engines` field.

Browser build tooling:

- Python package: `packages/browseros/pyproject.toml`.
- Python requirement: `>=3.12`.
- Requirements file: `packages/browseros/requirements.txt`.
- Browser build requires roughly 100 GB for Chromium source and build artifacts.

CLI:

- Go CLI source: `packages/browseros-agent/apps/cli`.
- CLI build file: `packages/browseros-agent/apps/cli/Makefile`.
- NPM wrapper package: `packages/browseros-agent/apps/cli/npm/package.json`.

## Agent Setup

From `packages/browseros-agent`:

```bash
cp apps/server/.env.example apps/server/.env.development
cp apps/agent/.env.example apps/agent/.env.development
cp apps/server/.env.production.example apps/server/.env.production
bun install
bun run dev:setup
```

Do not put real API keys, tokens, credentials, or user data in these files. Use local untracked `.env.*` files only.

## Simplest Agent Build Path

For phase 1, prefer the extension build before server production artifacts because it avoids production upload configuration:

```bash
cd packages/browseros-agent
bun install
bun run build:agent
```

The documented full agent build is:

```bash
cd packages/browseros-agent
bun run build
```

`bun run build` runs both `build:server` and `build:agent`. The server production build may require `.env.production` values for BrowserOS config, codegen, telemetry, and Cloudflare R2 artifact settings. Avoid adding real credentials to the repo.
For this private fork, `BROWSEROS_CONFIG_URL` must stay blank unless it is replaced with an internal/private endpoint. Do not point it back at BrowserOS cloud domains.

## Start Commands

From `packages/browseros-agent`:

```bash
bun run start:server
bun run start:agent
bun run dev:watch
```

The package scripts call shell scripts such as `tools/dev/run.sh`. On Windows, run those from Git Bash, WSL, or another shell that can execute POSIX shell scripts.

## Local Install

For unpacked extension install steps, see [INSTALL_RUNBOOK.md](INSTALL_RUNBOOK.md). Phase 1 should validate the agent as an unpacked extension before attempting a full BrowserOS/Chromium packaged install.

## Private Runtime Launcher

The current patched runtime uses the official BrowserOS/Chromium host binary with the private extension and private local server:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1
```

The launcher uses:

- Browser binary: `%LOCALAPPDATA%\Chromium\Application\chrome.exe`
- Private profile: `%LOCALAPPDATA%\BrowserOS-Private\profile`
- Private data directory: `%LOCALAPPDATA%\BrowserOS-Private\data`
- CDP port: `9005`
- Local server port: `9105`
- Extension port: `9305`
- Private extension: `packages\browseros-agent\apps\agent\dist\chrome-mv3`

Start only the private server when the browser is already running or you are debugging server startup:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1 -ServerOnly
```

Check server health:

```powershell
Invoke-RestMethod http://127.0.0.1:9105/health
```

Expected healthy result includes `status: ok` and `cdpConnected: true`.

Private runtime logs:

```text
%LOCALAPPDATA%\BrowserOS-Private\logs\server.out.log
%LOCALAPPDATA%\BrowserOS-Private\logs\server.err.log
```

The launcher intentionally passes `--disable-browseros-extensions`, `--browseros-disable-url-overrides`, `--disable-extensions-except=<private extension dist>`, and `--load-extension=<private extension dist>` so the patched local extension is loaded directly instead of waiting on the official managed extension/update path.

## Screenshot and Diagnostics

Use the BrowserOS capture helper when the window is on another monitor or normal screenshots miss part of the browser:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\capture-private-browseros.ps1
```

Default output directory:

```text
%TEMP%\codex-browseros-screenshots
```

The helper can capture the real top-level BrowserOS window and CDP page screenshots with `captureBeyondViewport=true`.

## Validation Commands

Run the lowest-cost relevant checks first:

```bash
cd packages/browseros-agent
bun run build:agent
bun run typecheck
bun run lint
```

Run tests when the required runtime dependencies are available:

```bash
cd packages/browseros-agent
bun run test
bun run test:main
cd apps/server && bun run test:tools
```

Some server and integration tests require a running BrowserOS instance, CDP connectivity, or BrowserOS-specific local state. Record those requirements instead of forcing a full browser setup during phase 1.

## Local-First Session Checks

For local session, mode, agent, skill, or API changes, run the targeted server and agent checks before heavier suites:

```bash
cd packages/browseros-agent
bun --env-file=apps/server/.env.development test apps/server/tests/local-only-cloud.test.ts
bun --env-file=apps/server/.env.development test apps/server/tests/api/routes/local.test.ts
bun --env-file=apps/server/.env.development test apps/server/tests/api/routes/klavis.test.ts
bun --env-file=apps/server/.env.development test apps/server/tests/api/routes/agents.test.ts apps/server/tests/lib/agents/acpx-runtime.test.ts apps/server/tests/agent/mcp-builder.test.ts
bun --env-file=apps/agent/.env.development test apps/agent/entrypoints/sidepanel/index/useChatSession.test.ts apps/agent/entrypoints/sidepanel/index/sidepanel-chat-targets.test.ts
bun --env-file=apps/agent/.env.development test apps/agent/lib/schedules/getChatServerResponse.test.ts apps/agent/lib/schedules/syncSchedulesToBackend.test.ts apps/agent/entrypoints/background/scheduledJobRuns.test.ts
bun run --filter @browseros/server typecheck
bun run --filter @browseros/agent typecheck
bun run build:agent
bun run verify:local-only
```

When the private BrowserOS launcher is already running, add the live local
verification:

```bash
cd packages/browseros-agent
bun run verify:live-local
```

This opens a temporary extension tab through CDP, switches through Chat,
Research, Workflow, and Goal, verifies each mode updates the chat input,
captures each resulting local `/chat` request body to prove the selected mode is
sent, seeds a local OpenAI-compatible provider and verifies the sidepanel sends
that local provider, model, and base URL without an API key, creates a
temporary local agent and captures each resulting
`/agents/:id/sidepanel/chat` request body, seeds both loopback and remote MCP
connector entries in local extension storage and verifies Chat sends no
connector tools while Research, Workflow, and Goal send only the loopback
connector, checks that the temporary agent's role bootstrap files are written
under the local BrowserOS data directory, opens the scheduled-task UI to verify
Chat, Research, Workflow, and Goal are available there too, seeds temporary
local scheduled tasks for each mode and verifies the saved mode renders from
local extension storage, exercises the live `/local/sessions` and local audit
APIs, seeds a temporary local UI session and verifies it restores after an
extension reopen, appears in chat history, and reopens by `conversationId`,
verifies local agent skills and role templates are served by
`/local/agent-capabilities`, verifies the AI settings Local runtime panel shows
local adapters, local roles, required runtime skills, and repo skills, checks
the local app catalog and Connect Apps page for a seeded live local MCP
connector without BrowserOS auth URLs, and fails if the page load or extension
service worker requests BrowserOS cloud or any non-local host.
The verifier also scans source, packaging scripts, CLI install/update surfaces,
and the built extension for BrowserOS web, docs, CDN, download, update, and
community links in runtime surfaces. Keep upstream links in repository
docs/license context, not in clickable private-build UI, installer, updater, or
tool responses.

Manual acceptance for this phase:

- Create a chat session.
- Close and reopen BrowserOS.
- Confirm the session appears in local history.
- Reopen the session and confirm messages/tool history restore.
- Confirm no BrowserOS account login is required.
- Confirm no requests go to BrowserOS cloud sync endpoints during normal local use.
- Open AI settings and confirm the Local runtime panel lists local agent adapters and runtime skills.
- Confirm the Local runtime panel lists local role templates, including Chief of Staff.
- Create a new local agent with a role template selected and confirm the agent can be used from the sidepanel target picker.
- In the sidepanel mode picker, confirm Chat, Research, Workflow, and Goal are visible. Both regular LLM targets and created local agent targets should send the selected mode in the local request body.
- In Chat mode, confirm the model only receives observe-only BrowserOS tools and no external/custom MCP tools. Created local agents should use the BrowserOS MCP URL with `mode=chat`.
- Confirm `/klavis/oauth-urls` and `/klavis/servers/submit-api-key` return disabled responses rather than upstream cloud auth URLs.
- Add a catalog app, attach a loopback MCP connector URL, use the connector check button to preview tool names, and confirm it appears as a live local MCP app.
- Start a chat with that connector enabled and confirm the request body includes it under `customMcpServers`, not `enabledMcpServers`.
- Select a created local agent target and confirm the same enabled loopback connector is passed into the agent runtime MCP server list.
- Create or edit a scheduled task and confirm scheduled execution posts only to the local `/chat` endpoint, sends the intended mode, and does not call BrowserOS schedule sync.

Local agent/skill discovery endpoints:

- `GET /local/agent-capabilities`: local agent adapter catalog, runtime skills, and cloud-disabled flags.
- `GET /local/agent-skills`: runtime skills that are materialized into agent homes.
- `GET /local/apps/catalog`: local app catalog metadata.
- `POST /local/apps/check-connector`: local MCP connector health check and tool preview. The URL must be loopback HTTP(S).

## Private Packaging Checks

Private packaged builds must not download official BrowserOS release artifacts
or use BrowserOS update channels. The local-only scanner covers the extension,
server, shared package, build scripts, CLI install/update commands, CLI npm
postinstall script, CLI installer scripts, and dogfood production-env defaults.

For private installer downloads, configure internal URLs only:

```bash
BROWSEROS_PRIVATE_DMG_URL=
BROWSEROS_PRIVATE_WINDOWS_INSTALLER_URL=
BROWSEROS_PRIVATE_DEB_URL=
BROWSEROS_PRIVATE_APPIMAGE_URL=
BROWSEROS_PRIVATE_DOWNLOAD_URL=
BROWSEROS_CLI_DOWNLOAD_BASE=
BROWSEROS_CLI_UPDATE_MANIFEST_URL=
```

Leave these blank until an internal release channel exists. Blank values should
disable official BrowserOS downloads instead of falling back to BrowserOS CDN,
files, or update servers.

When Go is available, validate CLI and dogfood packaging changes from
`packages/browseros-agent`:

```bash
gofmt -w apps/cli/cmd/install.go apps/cli/update/manager.go apps/cli/update/manager_test.go tools/dogfood/config/config.go tools/dogfood/config/config_test.go tools/dogfood/pipeline/env_test.go
cd apps/cli && go test ./...
cd ../../tools/dogfood && go test ./...
```

If `go` or `gofmt` is missing, record that blocker and keep the local-only
scanner plus shell/Node/PowerShell syntax checks as the available evidence.

## Browser Build Notes

The Chromium browser path lives in `packages/browseros`. It is out of scope for this phase unless the Chromium source tree already exists locally.

Reference commands from upstream docs:

```bash
cd packages/browseros
pip install -e .
browseros setup
browseros apply
browseros build
browseros package
```

Expected blockers for a fresh machine include missing Python 3.12+, Chromium `depot_tools`, Visual Studio Build Tools on Windows, platform SDKs, and about 100 GB of disk space.

## Troubleshooting

- Missing `bun`: install Bun and verify `bun --version`. The agent package expects `bun@1.3.6`.
- `yarn install` appears in root `CONTRIBUTING.md`: prefer `packages/browseros-agent/README.md` and `package.json`; the current agent workspace is Bun-based.
- Shell script fails on Windows PowerShell: rerun from Git Bash or WSL.
- GraphQL codegen fails: the agent defaults to `apps/agent/schema/schema.graphql`; verify the file exists or set `GRAPHQL_SCHEMA_PATH` in an untracked local env file.
- Browser/CDP tests fail: start BrowserOS or skip integration tests until the browser runtime is available.
- Server production build asks for R2 or telemetry values: do not commit credentials; document the missing variables and continue with extension build/typecheck/lint evidence.
- A scan finds `api.browseros.com`, `graph.browseros.com`, `llm.browseros.com`, `cdn.browseros.com`, `files.browseros.com`, `docs.browseros.com`, `browseros.com`, or upstream community redirect links in runtime code/env: remove the runtime default or replace it with an internal extension route/private endpoint. Repository docs and license/attribution references should be reviewed separately.
- Browser shows `PannamOS Agent is installing/updating`: restart through `scripts\launch-private-browseros.ps1`, not the normal official shortcut. The private launcher disables the managed extension path and loads only `apps\agent\dist\chrome-mv3`.
- Assistant shows `No pending tool approval matched this response`: stale interrupted tool calls may be in the current session. The server now sanitizes incomplete tool calls before normal follow-up messages; reload the Assistant panel and retry from the current chat state.
- Assistant or extension pages crash with `Error code: Out of Memory`: close the private BrowserOS runtime, restart with the private launcher, and check `%LOCALAPPDATA%\BrowserOS-Private\logs`. Current mitigations reduce extension/update conflicts, but memory-aware tab reuse/cleanup is still a phase 1 follow-up.
- ChatGPT Plus/Pro says it is not authenticated: do not confuse this with BrowserOS account login. Provider authentication is separate and still needs a clearer private provider configuration UI.
- The old `C:\Users\pannam\Documents\BrowserOS` copy cannot be removed: close BrowserOS, Bun, Node, and Codex processes that may still reference it, then remove it manually once the Desktop copy is verified.

## Codex Workflow

Each private-fork change should end with a short evidence block:

- Files changed.
- Commands run.
- Pass/fail result for build, lint, typecheck, and tests.
- Any missing dependency or environment blocker.
- Confirmation that no secrets were added and no upstream PR or push occurred.

## Baseline Attempt: 2026-05-28

Local environment observed during the initial private-fork foundation pass:

- `node --version`: passed with `v22.11.0`.
- `python --version`: passed with `Python 3.12.3`.
- `bun --version`: initially failed because `bun` was not installed or not on `PATH`.
- Bun was installed locally at `C:\Users\pannam\.bun\bin\bun.exe`; `bun --version` then passed with `1.3.6` when that directory was added to `PATH`.
- `go version`: failed because `go` was not installed or not on `PATH`.
- `zip -v`: initially missing; installed with Scoop, then passed with Info-ZIP `3.0`.

Commands attempted from `packages/browseros-agent`:

- `bun install`: passed after Bun install.
- `bun run build:agent`: initially failed because blank `GRAPHQL_SCHEMA_PATH=` in `apps/agent/.env.development` disabled the bundled schema fallback; passed after `apps/agent/codegen.ts` was updated to treat blank values as unset.
- `bun run typecheck`: passed.
- `bun run lint`: passed after adding Bun's bin directory to `PATH` and normalizing the local working tree to LF line endings. The command still reports existing warnings.
- `bun run build`: failed because production server builds require `CODEGEN_SERVICE_URL`, `POSTHOG_API_KEY`, and `SENTRY_DSN`. Do not invent or commit those values.
- `bun run build:server:ci`: passed and produced server resource zip artifacts for linux-x64, linux-arm64, windows-x64, darwin-arm64, and darwin-x64.
- `bun run test:main`: timed out while running the full server tools/integration wrapper.
- `cd apps/server && bun run test:tools`: timed out on the full tools group because it includes browser-backed tool tests.

Additional targeted tests:

- `bun run ./scripts/run-bun-test.ts ./apps/agent`: passed, 91 tests.
- Server non-browser tools subset (`filesystem`, `acl-scorer`, `keyboard`, `response`): passed, 154 tests.
- `bun run ./scripts/run-bun-test.ts ./scripts/build`: passed, 10 tests.
- Server root group (`cd apps/server && bun run ./tests/__helpers__/run-test-group.ts root`): passed, 58 tests, 4 skipped.
- The skipped root test is a POSIX fake-browser launch fixture that needs a real Windows executable fixture before it can run on Windows.

Static checks:

- `git diff --check`: passed.
- Review of changed files found no real secrets, API keys, tokens, private credentials, or user data.

Browser build status:

- `packages/browseros` contains BrowserOS build tooling, patches, and resources.
- No large Chromium source checkout was present, so no full Chromium browser build was attempted.

## Live Runtime Fixes: 2026-05-31 to 2026-06-01

The following private runtime fixes were applied after the baseline build:

- Added `scripts\launch-private-browseros.ps1` to run the official BrowserOS host with a private profile, private local server, and patched unpacked extension.
- Updated the launcher to include `--disable-extensions-except=<private extension dist>`, which fixed repeated `PannamOS Agent is installing/updating` messages caused by extension state/update conflicts.
- Added `scripts\capture-private-browseros.ps1` so Codex can capture the real BrowserOS window across monitors and CDP page screenshots.
- Added `sanitizeIncompleteToolCalls` in `apps/server/src/agent/message-validation.ts` and integrated it into `apps/server/src/api/services/chat-service.ts` to prevent stale interrupted tool calls from breaking later chat turns.
- Added targeted tests for stale approval/tool-call cleanup in `apps/server/tests/agent/message-validation.test.ts`.

Validation evidence from that fix:

```bash
cd packages/browseros-agent
bun test packages/browseros-agent/apps/server/tests/agent/message-validation.test.ts
bun run --filter @browseros/server typecheck
```

Both commands passed when run after the fix. The private health check at `http://127.0.0.1:9105/health` returned `status: ok` and `cdpConnected: true`.
