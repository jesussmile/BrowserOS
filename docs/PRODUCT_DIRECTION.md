# Product Direction

The first private product direction is:

> A private AI browser based on BrowserOS, optimized for supervised browser automation, form filling, research, and repeatable workflows.

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
