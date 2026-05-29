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

## Install BrowserOS as the Validation Host

Do not install BrowserOS automatically from scripts in this private repo. Install it manually only after the team approves using the upstream public binary for local validation.

Authoritative upstream references:

- Download page: `https://browseros.com`
- GitHub Releases: `https://github.com/browseros-ai/BrowserOS/releases`
- Existing upstream Windows update doc: `docs/update/windows.mdx`

Current release evidence captured on 2026-05-28 from the official GitHub API:

- Latest release: `BrowserOS - v0.44.0`
- Tag: `v0.44.0.1`
- Release URL: `https://github.com/browseros-ai/BrowserOS/releases/tag/v0.44.0.1`
- Windows installer asset: `BrowserOS_v0.44.0.1_x64_installer.exe`
- Windows installer URL: `https://github.com/browseros-ai/BrowserOS/releases/download/v0.44.0.1/BrowserOS_v0.44.0.1_x64_installer.exe`

Before installing, re-check GitHub Releases because release assets can change.

Download-only preparation evidence captured on this Windows machine at 2026-05-28 20:29:46 -05:00:

- Download path: `%TEMP%\BrowserOS_v0.44.0.1_x64_installer.exe`
- Download size: `144246328` bytes
- Local SHA-256: `DDA9ACBB40D40AB11680B2C7DC87D3BACA189B6ADD92475B9634DB4C137A1B7C`
- The SHA-256 value above is locally computed for this downloaded file; it is not an upstream-published checksum.
- Windows Authenticode status: `Valid` (`Signature verified.`)
- Windows Authenticode signer: `Felafax, Inc.`
- The installer was downloaded for validation prep only and was not executed.

To repeat the download-only check without running the installer:

```powershell
$url = 'https://github.com/browseros-ai/BrowserOS/releases/download/v0.44.0.1/BrowserOS_v0.44.0.1_x64_installer.exe'
$out = Join-Path $env:TEMP 'BrowserOS_v0.44.0.1_x64_installer.exe'
Invoke-WebRequest -Uri $url -OutFile $out
Get-FileHash -Algorithm SHA256 -LiteralPath $out
Get-AuthenticodeSignature -LiteralPath $out
```

After BrowserOS is installed:

1. Launch BrowserOS.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load the private no-update build from `packages/browseros-agent/apps/agent/dist/chrome-mv3`.
5. Confirm the extension loads and the toolbar title is `Ask BrowserOS`.
6. Start the local server and verify the side panel can connect.

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
