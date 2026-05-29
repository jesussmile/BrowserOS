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

For a private unpacked build that does not include the BrowserOS public extension update URL:

```bash
BROWSEROS_PRIVATE_DISABLE_UPDATE_URL=true bun run build:agent
```

On PowerShell:

```powershell
$env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL='true'
bun run build:agent
Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL
```

The built extension is written to:

```text
packages/browseros-agent/apps/agent/dist/chrome-mv3
```

## Load the Extension Locally

Use BrowserOS for full local validation because the agent manifest includes BrowserOS-specific extension permissions.

In BrowserOS:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select `packages/browseros-agent/apps/agent/dist/chrome-mv3`.

For full functionality, the BrowserOS server must also be running locally and reachable by the extension.

Stock Google Chrome is useful for checking generic Manifest V3 packaging, but it is not the target host for this extension. If Chrome rejects or ignores the unpacked build, validate in BrowserOS before changing manifest permissions.

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

## Local Validation: 2026-05-28

On this Windows machine:

- `BROWSEROS_PRIVATE_DISABLE_UPDATE_URL=true bun run build:agent`: passed.
- Generated manifest check: `manifest_version` was `3`, extension name was `Assistant`, toolbar title was `Ask BrowserOS`, and `update_url` was absent.
- Temporary stock Chrome launch with `--load-extension=packages/browseros-agent/apps/agent/dist/chrome-mv3`: did not register the unpacked BrowserOS agent extension in the temporary profile.
- Chrome logs showed Google Chrome ignored `--disable-extensions-except`; DevTools only exposed Chrome component extension targets, not the BrowserOS agent.
- Windows uninstall registry and standard install paths did not show a local BrowserOS installation.

Next install validation requires either:

- Installing BrowserOS locally and loading the unpacked agent extension there, or
- Creating a separate Chrome-only test manifest variant that intentionally omits BrowserOS-specific permissions and APIs.
