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

## BrowserOS Install Validation: 2026-05-28

On this Windows machine:

- Upstream BrowserOS installer `BrowserOS_v0.44.0.1_x64_installer.exe` was launched manually from `%TEMP%`.
- Windows registered `BrowserOS` version `146.0.7821.31`.
- Install location: `%LOCALAPPDATA%\Chromium\Application`
- Uninstall command: `%LOCALAPPDATA%\Chromium\Application\146.0.7821.31\Installer\setup.exe --uninstall`
- BrowserOS server process was running from `%LOCALAPPDATA%\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\browseros_server.exe`.
- `server_config.json` reported BrowserOS version `0.44.0.1`, Chromium version `146.0.7821.31`, CDP port `9101`, server port `9200`, and extension port `9300`.
- `http://127.0.0.1:9200/health` returned `status: ok` and `cdpConnected: true`.
- Temporary validation launch used `%LOCALAPPDATA%\Chromium\Application\chrome.exe` with a temporary profile and `--load-extension=packages/browseros-agent/apps/agent/dist/chrome-mv3`.
- DevTools reported one extension service worker target for `chrome-extension://bflpfmnmnokmjhmgnolecpppdbdophmk/background.js`.
- The normal BrowserOS `Default` profile already contained the upstream bundled `Assistant` extension at version `0.0.102.0`.
- The bundled `Assistant` extension manifest in the normal profile included `update_url=https://cdn.browseros.com/extensions/update-manifest.xml`.
- The private no-update extension was validated in a temporary profile; it was not used to replace the bundled `Assistant` extension in the normal profile.

Remaining validation:

- Open BrowserOS interactively.
- Decide whether to disable/remove the bundled upstream `Assistant` extension in the normal profile for private-extension validation.
- Load the private no-update extension from `packages/browseros-agent/apps/agent/dist/chrome-mv3` into the normal BrowserOS profile through `chrome://extensions`.
- Confirm the toolbar title is `Ask BrowserOS`.
- Confirm the side panel can talk to the local BrowserOS server on `http://127.0.0.1:9200`.

## Clean Official Reinstall: 2026-05-30

On this Windows machine:

- The current BrowserOS profile was backed up before reset to `%LOCALAPPDATA%\BrowserOS-backups\User Data-20260530-085154`.
- The active pre-reset profile was moved aside to `%LOCALAPPDATA%\BrowserOS-backups\User Data-active-profile-before-clean-install-20260530-085317`.
- BrowserOS was uninstalled using the registered user-level uninstaller.
- The official upstream Windows installer `BrowserOS_v0.44.0.1_x64_installer.exe` was downloaded again from the latest GitHub release.
- Download size matched the release asset at `144246328` bytes.
- Local SHA-256 was `DDA9ACBB40D40AB11680B2C7DC87D3BACA189B6ADD92475B9634DB4C137A1B7C`.
- Windows Authenticode status was `Valid`, signed by `Felafax, Inc.`
- BrowserOS reinstalled as version `146.0.7821.31` at `%LOCALAPPDATA%\Chromium\Application`.
- The new `server_config.json` reported BrowserOS version `0.44.0.1`, Chromium version `146.0.7821.31`, CDP port `9101`, server port `9200`, extension port `9300`, and a new install ID.
- `http://127.0.0.1:9200/health` returned `status: ok` and `cdpConnected: true`.
- The bundled `Assistant` extension was present at version `0.0.102.0` with `update_url=https://cdn.browseros.com/extensions/update-manifest.xml`.
- Extension storage was fresh: no local conversations and no stored BrowserOS account session.
- The private no-update extension build from this repository was not loaded into the clean official profile.
