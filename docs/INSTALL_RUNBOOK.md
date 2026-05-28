# Private Install Runbook

This runbook covers local installation for internal validation. It does not describe publishing or distributing modified builds externally.

## What We Can Install Now

For phase 1, install the BrowserOS agent extension as an unpacked development build. This validates the agent UI and extension packaging without requiring a full Chromium browser rebuild.

Do not install or distribute a branded production build until the private branding/config layer, update-channel policy, and licensing review are complete.

## Build the Agent Extension

From `packages/browseros-agent`:

```bash
bun install
bun run build:agent
```

The built extension is written to:

```text
packages/browseros-agent/apps/agent/dist/chrome-mv3
```

## Load the Extension Locally

In Chrome, Chromium, or BrowserOS:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `packages/browseros-agent/apps/agent/dist/chrome-mv3`.

For full functionality, the BrowserOS server must also be running locally and reachable by the extension.

## Start the Local Server

From `packages/browseros-agent`:

```bash
bun run start:server
```

On Windows, scripts that call `.sh` files may need Git Bash or WSL. If PowerShell fails on a shell script, rerun the command from Git Bash or use the lower-level package script that runs Bun directly.

## Internal Packaged Build Later

Milestone 4 should define the packaged internal install path:

- Platform targets.
- Signing and notarization requirements.
- Private update channel or explicit no-update policy.
- Legal review of AGPL-3.0 obligations before external distribution.
- A clean install/uninstall procedure for test users.

## Install Evidence To Record

Every install validation should record:

- Commit SHA and branch.
- Agent build command and result.
- Browser used to load the extension.
- Whether the server was running locally.
- Any disabled update channel or private update URL.
- Screenshots or notes for install errors.
