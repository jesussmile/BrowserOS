# Product Direction

The first private product direction is:

> A private AI browser based on BrowserOS, optimized for supervised browser automation, form filling, research, and repeatable workflows.

Phase 1 extends that direction with a local-first session foundation: chats, goal runs, and audit events should be saved on the user's PC through the local BrowserOS server/SQLite layer, not through BrowserOS cloud login or sync.

For the current implementation history, launcher details, observed failures, and remaining blockers, see [PHASE1_STATUS.md](PHASE1_STATUS.md).

## Current Implementation Snapshot

The current private build is agent-first, not a full Chromium fork rebuild:

- It uses the official BrowserOS/Chromium Windows binary as the host.
- It runs a private local server on `http://127.0.0.1:9105`.
- It loads the patched unpacked Assistant extension from `packages/browseros-agent/apps/agent/dist/chrome-mv3`.
- It stores runtime data under `%LOCALAPPDATA%\BrowserOS-Private`.
- It avoids the official BrowserOS managed extension/update path in the private launcher.
- It has local SQLite-backed sessions, messages, goal runs, and audit event tables.
- It has local-only API routes for sessions, goals, audit events, agent capabilities, local skills, and local app catalog behavior.
- Standalone browser identity work has started for PannamOS: artifact names, Chromium branding replacements, and Windows install-static patch constants now have PannamOS-specific config surfaces.
- Goal Loop persistence has started on top of `local_goal_runs`: queue items and checkpoints are stored in local SQLite.
- The native server-side Goal Loop runner can now plan a goal contract, execute queue items continuously through an injected executor, retry failures, pause on high-risk approval gates, resume unfinished queue work, and generate a final manifest.
- Provider setup is local-first: OpenAI/OpenAI-compatible providers use BYOK API keys, and ChatGPT Plus/Pro uses the local OAuth provider flow.

This is enough for phase 1 validation and local product iteration. It is not yet an internal packaged browser build.

## Principles

- Build from the BrowserOS agent layer first.
- Keep upstream attribution and AGPL-3.0 notices intact.
- Keep private configuration, branding, and deployment decisions isolated from upstream syncs.
- Prefer reviewed configuration layers over scattered product-name or provider changes.
- Do not add secrets, provider API keys, tokens, credentials, or user data to source control.

## Milestones

### Milestone 0: Private Repo Hygiene and Baseline Build

- Document private mirror remotes and upstream sync workflow.
- Confirm the BrowserOS agent can install and build locally.
- Record build, lint, typecheck, and test evidence for each change.
- Keep Chromium browser rebuilds out of scope unless the required Chromium source and toolchain are already present.

### Milestone 1: Private Branding and Configuration Layer

- Inventory visible BrowserOS product strings, extension manifest values, icons, update URLs, web hosts, and API endpoints.
- Design a central private branding/configuration layer before changing user-visible strings.
- Preserve BrowserOS attribution and license notices.
- Follow [BRANDING_CONFIG.md](BRANDING_CONFIG.md) for the first typed configuration layer.

### Milestone 2: Provider Configuration and Local/Cloud Model Selection

- Define supported provider modes for internal use.
- Keep provider credentials outside source control.
- Support local model paths such as Ollama or LM Studio where practical.
- Document cloud-provider approval and configuration requirements.

### Milestone 3: Safer Browser-Control Permissions and Audit Logs

- Review browser automation permissions by task type.
- Add audit logs for high-impact browser actions before expanding autonomous behavior.
- Define approval boundaries for form submission, downloads/uploads, account changes, and other sensitive actions.

### Milestone 3.5: Continuous Goal Loop

- Add a native PannamOS continuation loop inspired by `oh-my-openagent`'s `ulw-loop` and Ralph Loop patterns.
- Add a todo enforcer so unfinished goal queue items wake the runner instead of leaving the user to restart the work.
- Add start-work planning: convert large requests into a goal contract, queue, approval scope, and completion criteria before execution.
- Add session recovery for context limits, model/API errors, malformed tool results, and browser/runtime failures.
- Persist durable loop state in local SQLite: queue items, checkpoints, evidence, retry counts, continuation decisions, and final manifests.
- Treat `oh-my-openagent` as design inspiration only unless license review approves direct source reuse.

## Local-First Session Foundation

Implemented local server API surface:

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

Implemented SQLite tables:

- `local_sessions`
- `local_session_messages`
- `local_goal_runs`
- `local_goal_queue_items`
- `local_goal_checkpoints`
- `local_audit_events`

Current scope:

- Agent adapter and runtime skill catalogs are exposed through `/local/agent-capabilities` for local UI discovery.
- Sidepanel modes are local product modes: Chat, Research, Workflow, and Goal. The selected mode is passed to both the normal local chat route and created-agent sidepanel route.
- Chat mode is observe-only: BrowserOS MCP is restricted to known read-only tools and external/custom MCP connectors are not exposed in that mode.
- Legacy upstream/Klavis app routes return local catalog or disabled responses instead of initiating upstream cloud auth/sync.
- Local app catalog entries can be upgraded into live tools by attaching a loopback MCP connector URL such as `http://localhost:8000/sse`; BrowserOS cloud app authentication remains disabled. These local connectors are available to both normal chat and created local agent targets.
- Remote MCP URLs are not treated as live tools in this private build.
- The sidepanel history uses local sessions instead of upstream GraphQL history.
- Existing extension-stored conversations are migrated into SQLite when the local server is available.
- Browser tool executions write local audit metadata without storing raw form text or provider secrets.
- BrowserOS account login and cloud sync prompts are disabled for normal local use.

## Current Phase 1 Gaps

The next product work should finish the runtime behavior needed for reliable local use:

- Goal Mode needs a private auto-approval policy for low-risk actions.
- Goal Mode has durable queue/checkpoint storage and a native runner service, but still needs UI wiring and a production browser/tool executor that feeds real browser automation results into queue items.
- Goal Mode needs todo enforcement, session recovery, and handoff summaries for long-running tasks.
- Risky actions still need explicit approval: form submission, purchases, deletions, uploads, account setting changes, credential entry, and login/account actions.
- Browser tabs created by a goal should be reused or closed when the goal completes.
- Goal runs need memory guardrails so repeated page/script inspection does not crash BrowserOS.
- Provider setup exposes OpenAI API, ChatGPT Plus/Pro OAuth, and OpenAI-compatible providers; the UI must keep BrowserOS account login clearly separate from provider authentication.
- Internal packaging is still missing; the current setup is a development launcher over the official BrowserOS host.

### Milestone 4: Packaged Internal Build

- Package an internal build with private update channels or no update channel.
- Verify license and attribution requirements before distribution.
- Document supported platforms and installation steps.
- Follow [INSTALL_RUNBOOK.md](INSTALL_RUNBOOK.md) for local install validation before packaged builds.

## Non-Goals

- No public release in phase 1.
- No upstream PRs from this private mirror.
- No secret handling in code.
- No full Chromium fork changes until the agent layer is understood.
- No broad rebranding pass before a central branding/configuration layer exists.

## Branding Placeholder Notes

Current obvious branding/configuration touchpoints include:

- `packages/browseros-agent/apps/agent/wxt.config.ts`: extension manifest name, toolbar title, BrowserOS CDN update URL, and connectable web host rules.
- `packages/browseros-agent/apps/agent/assets/product_logo.svg`: agent UI product logo.
- `packages/browseros-agent/apps/agent/public/icon/`: extension icons.
- `packages/browseros-agent/apps/agent/lib/constants/productWebHost.ts`: product web host constant.
- `packages/browseros-agent/apps/agent/lib/constants/productUrls.ts`: product URL constants.
- `packages/browseros-agent/apps/agent/lib/constants/mediaUrls.ts`: media URL constants.
- `packages/browseros-agent/apps/agent/.env.example`: public API, telemetry, and browser binary defaults.
- `packages/browseros-agent/apps/server/.env.example`: server config URL, telemetry, and install/client IDs.

Do not replace these ad hoc. The next private branding task should define a central configuration strategy, then update only the minimum required UI and packaging surfaces.
