# Private Install Runbook

This runbook covers local installation for internal validation. It does not describe publishing or distributing modified builds externally.

## What We Can Install Now

For local/internal validation, we can now install the unsigned standalone
PannamOS Windows build:

```text
packages\browseros\dist\PannamOS_v0.46.2_x64_installer.exe
```

This installer is for personal/internal testing only. Do not distribute it
externally until the private branding/config layer, update-channel policy,
signing process, and licensing review are complete.

For rapid agent UI/server work, keep using the unpacked development extension
workflow below. Most Goal Loop, provider, sidepanel, and server changes do not
require rebuilding Chromium.

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
5. Confirm the extension loads and the toolbar title is `Ask PannamOS`.
6. Start the local server and verify the side panel can connect.

## Start the Local Server

From `packages/browseros-agent`:

```bash
bun run start:server
```

On Windows, scripts that call `.sh` files may need Git Bash or WSL. If PowerShell fails on a shell script, rerun the command from Git Bash or use the lower-level package script that runs Bun directly.

## PannamOS Standalone Install Target

The standalone browser target is PannamOS, not a modified install of official BrowserOS.

Locked v1 expectations:

- Windows-only, internal/personal, unsigned, manually updated.
- Installer artifact name: `PannamOS_v<version>_<arch>_installer.exe`.
- Product install path must be PannamOS-specific and must not be `%LOCALAPPDATA%\Chromium\Application`.
- User profile and server runtime data must be PannamOS-specific and separate from official BrowserOS.
- PannamOS browser profile data must default to `E:\PannamOS\BrowserProfile`.
- PannamOS server runtime data must default to `E:\PannamOS\ServerState`.
- PannamOS generated outputs must default to `E:\PannamOS\Outputs`.
- Windows app GUIDs, CLSIDs, protocol IDs, ProgIDs, uninstall entries, and extension identity must be PannamOS-specific.
- Upstream login, upstream cloud sync, and upstream public update channels must not be required for normal local use.
- Sidecar server updates must be manual by default. The sidecar updater must not
  start unless explicitly opted in with `--pannamos-enable-server-updater`.

Current implementation surfaces:

- `packages/browseros/build/common/product_identity.py`
- `packages/browseros/build/common/context.py`
- `packages/browseros/build/config/release.windows.pannamos.local.yaml`
- `packages/browseros/build/modules/resources/pannamos_server_resources.py`
- `packages/browseros/build/modules/extensions/pannamos_agent_extension.py`
- `packages/browseros/chromium_files/chrome/app/theme/chromium/BRANDING.*`
- `packages/browseros/chromium_patches/chrome/install_static/chromium_install_modes.h`
- `packages/browseros/chromium_patches/chrome/install_static/user_data_dir.cc`

## Migrate Existing Local PannamOS Data to E:

Use this only after closing all PannamOS windows and ensuring
`browseros_server.exe` is not running.

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\migrate-pannamos-storage-to-e.ps1
```

The script copies the old `%LOCALAPPDATA%\PannamOS\User Data` profile to
`E:\PannamOS\BrowserProfile`, copies old `.pannamos` server state to
`E:\PannamOS\ServerState`, writes migration logs under
`E:\PannamOS\Backups\Migration-<timestamp>`, verifies the copy, then deletes the
old C: profile. Use `-SkipDelete` for a copy-only dry migration.

## Build the Local PannamOS Windows Installer Target

Use this path for the first unsigned, manually updated standalone installer build.
It requires a full Chromium source checkout and Windows Chromium build prerequisites.

Run the local preflight first:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\test-pannamos-standalone-prereqs.ps1 -ChromiumSrc <path-to-chromium-src>
```

If depot_tools is not available yet, prepare the local Chromium build helper:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\setup-pannamos-chromium-env.ps1
```

This clones depot_tools to `%LOCALAPPDATA%\PannamOS\depot_tools` and writes:

```text
%LOCALAPPDATA%\PannamOS\chromium-build-env.ps1
```

To start the full Chromium checkout later, run the same helper with
`-FetchChromium`. That operation is intentionally not automatic because it can
take hours and hundreds of GB:

```powershell
.\scripts\setup-pannamos-chromium-env.ps1 -FetchChromium
```

To monitor an in-progress fetch started by Codex or a local shell:

```powershell
.\scripts\get-pannamos-chromium-fetch-status.ps1
```

The monitor reports the fetch PID, latest stdout/stderr logs, remaining disk
space, and whether `C:\src\chromium\src` has become a valid Chromium checkout.
If the first fetch is interrupted after `.gclient` is written but before `src`
exists, rerun the same `-FetchChromium` command; the helper resumes with
`gclient sync --nohooks`.

When preflight passes, run the wrapper:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\build-pannamos-windows-installer.ps1
```

To monitor an in-progress installer build started by Codex or a local shell:

```powershell
.\scripts\get-pannamos-build-status.ps1
```

The wrapper loads the generated PannamOS extension env helper, verifies local
CRX/server-resource prerequisites, loads `%LOCALAPPDATA%\PannamOS\chromium-build-env.ps1`,
then invokes the browser build config. Pass `-ChromiumSrc <path-to-chromium-src>`
only when using a non-default Chromium checkout.

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros
$env:PANNAMOS_AGENT_CRX='C:\path\to\pannamos-agent.crx'
$env:PANNAMOS_AGENT_EXTENSION_ID='<private-extension-id>'
python -m build.browseros build `
  --config build/config/release.windows.pannamos.local.yaml `
  --chromium-src <path-to-chromium-src>
Remove-Item Env:PANNAMOS_AGENT_CRX
Remove-Item Env:PANNAMOS_AGENT_EXTENSION_ID
```

The PannamOS local config:

- applies PannamOS branding and install-static patches
- stages locally built PannamOS server resources instead of downloading BrowserOS R2 artifacts
- bundles a locally supplied PannamOS agent CRX into Chromium
- builds `chrome`, `chromedriver`, `setup`, and `mini_installer`
- packages `mini_installer.exe` as `PannamOS_v<version>_x64_installer.exe`
- skips Windows code signing
- disables Chromium updater for the local Windows release build
- packages bundled sidecar resources under `PannamOSServer`
- writes sidecar runtime state under `.pannamos`
- points default sidecar server appcast URLs at inert `pannamos.invalid` URLs
- keeps the sidecar server updater disabled by default
- skips upload
- skips the BrowserOS R2-backed `download_resources` module
- skips the BrowserOS CDN-backed bundled extension module

By default, server resources are read from:

```text
packages/browseros-agent/dist/prod/server/windows-x64/resources
```

If that folder is missing, build the server first from `packages/browseros-agent`
or set `PANNAMOS_SERVER_RESOURCES_DIR` to a reviewed local resources folder.
Do not use BrowserOS R2 credentials as the default local PannamOS build path.

`PANNAMOS_AGENT_CRX` must point to a locally packed PannamOS agent `.crx`.
`PANNAMOS_AGENT_EXTENSION_ID` must be the private Chrome extension ID for that
CRX and must not be an upstream BrowserOS extension ID. The build validates the
ID against the built agent manifest key when the manifest contains a `key`.
The build module reads the extension version from
`packages/browseros-agent/apps/agent/dist/chrome-mv3/manifest.json`, unless
`PANNAMOS_AGENT_VERSION` is set. Do not commit CRX files, private extension
keys, provider keys, or signing material to the repo.

When building the agent for a private CRX, set the public manifest key before
running the agent build:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS\packages\browseros-agent
$env:PANNAMOS_AGENT_EXTENSION_KEY='<public-key-matching-private-crx-key>'
bun run build:agent
Remove-Item Env:PANNAMOS_AGENT_EXTENSION_KEY
```

Pack/sign the CRX with the matching private key outside the repo. The private
key must stay out of source control and out of docs.

The repository also includes a helper that does this local workflow without
storing private key material in the repo:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\build-pannamos-agent-crx.ps1 -DisableNewTabOverride
. "$env:LOCALAPPDATA\PannamOS\extension-artifacts\pannamos-agent-env.ps1"
```

The helper:

- creates or reuses a private key at `%LOCALAPPDATA%\PannamOS\extension-key\pannamos-agent.pem`
- builds the agent with the matching public manifest key
- packs a CRX using the installed BrowserOS/Chromium host
- writes the CRX and env helper under `%LOCALAPPDATA%\PannamOS\extension-artifacts`

Use `-RegenerateKey` only when intentionally changing the private extension
identity. Doing that changes the extension ID and requires a fresh installer
build plus side-by-side validation.

If a reviewed private extension signing key/process is not available yet, stop
here. Do not use BrowserOS public extension CRXs or update manifests for a
private PannamOS build.

By default, the browser build context uses an inert extension manifest URL:

```text
https://browseros.invalid/extensions/update-manifest.xml
```

Set `PANNAMOS_EXTENSIONS_MANIFEST_URL` only after an approved private extension
hosting/signing process exists. Do not use BrowserOS public extension update
manifests for private PannamOS builds.

Completed local standalone packaging evidence on 2026-06-02:

- Chromium checkout: `C:\src\chromium\src`
- Browser output: `C:\src\chromium\src\out\Default_x64\chrome.exe`
- Installer output: `C:\src\chromium\src\out\Default_x64\mini_installer.exe`
- Dist installer:
  `packages\browseros\dist\PannamOS_v0.46.2_x64_installer.exe`
- Dist zip:
  `packages\browseros\dist\PannamOS_v0.46.2_x64_installer.zip`
- Installed path: `%LOCALAPPDATA%\PannamOS\Application`
- Installed sidecar resources:
  `%LOCALAPPDATA%\PannamOS\Application\148.0.7925.97\PannamOSServer\default\resources\bin\browseros_server.exe`
- Runtime path: `%LOCALAPPDATA%\PannamOS\User Data\.pannamos`

Remaining standalone packaging work:

- establish a reviewed private extension CRX packing/signing process for
  repeatable release builds
- install official BrowserOS on a clean validation machine and record explicit
  side-by-side comparison evidence
- add stronger automated checks for extension title, toolbar title, normal chat,
  Goal Mode, and local BYOK provider setup inside installed PannamOS

## Incremental Testing After The First Browser Build

Do not rebuild all of Chromium for every small feature.

- Sidepanel, server, provider, Goal Loop, and UI changes: rebuild/test
  `packages/browseros-agent`; relaunch PannamOS or reload the extension as
  needed.
- Chromium C++/IDL/resource changes: run an incremental target build from the
  Chromium checkout, for example:

```powershell
. "$env:LOCALAPPDATA\PannamOS\chromium-build-env.ps1"
Set-Location $env:CHROMIUM_SRC
autoninja.bat -C out\Default_x64 chrome chromedriver
```

- Installer packaging changes: rebuild only the installer targets:

```powershell
. "$env:LOCALAPPDATA\PannamOS\chromium-build-env.ps1"
Set-Location $env:CHROMIUM_SRC
autoninja.bat -C out\Default_x64 setup mini_installer
```

Then refresh the dist installer from:

```text
C:\src\chromium\src\out\Default_x64\mini_installer.exe
```

Avoid wrapper/build paths that clean `out\Default_x64` unless intentionally
doing a from-clean release verification.

## PannamOS Side-by-Side Validation

Run this validation only after a packaged PannamOS installer is built.

Automated local check:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\test-pannamos-side-by-side-install.ps1 -Install -Launch
```

Without `-Install`, the script validates the newest matching
installer path when one is supplied and checks any already installed PannamOS
registry/install state. Use this mode when recording evidence after a manual
install:

```powershell
.\scripts\test-pannamos-side-by-side-install.ps1 `
  -InstallerPath (Resolve-Path 'packages\browseros\dist\PannamOS_v0.46.2_x64_installer.exe') `
  -Launch
```

1. Install official BrowserOS first and record its install path, profile path, server data path, uninstall command, protocol handlers, and extension update URL.
2. Install `PannamOS_v<version>_<arch>_installer.exe`.
3. Confirm PannamOS launches without changing or replacing the official BrowserOS install.
4. Confirm PannamOS does not write into `%LOCALAPPDATA%\Chromium\Application`.
5. Confirm PannamOS has separate Windows uninstall registry entries, `DisplayName` set to `PannamOS`, app GUIDs, CLSIDs, ProgIDs, protocol handlers, install path, profile path, and runtime data path.
6. Confirm the PannamOS profile contains `.pannamos` runtime state and does not contain `.browseros` runtime state.
7. Confirm installed sidecar resources live under `PannamOSServer` and no
   `BrowserOSServer` directory exists inside the PannamOS install.
8. Confirm the PannamOS `.pannamos` runtime does not create updater `versions` or `pending_update` folders by default.
9. Confirm the PannamOS extension title is `PannamOS Assistant` and toolbar title is `Ask PannamOS`.
10. Confirm normal chat, local sessions, Goal Mode, and provider setup work without BrowserOS account login.
11. Confirm OpenAI/OpenAI-compatible provider configuration and ChatGPT Plus/Pro OAuth tokens stay local, and no provider keys/tokens are written to source files, logs, docs, or BrowserOS cloud sync.
12. Uninstall PannamOS.
13. Confirm official BrowserOS still launches, still uses its original profile/server data, and remains uninstallable independently.

Record command output and screenshots for the install path, registry/uninstall entries, and `chrome://version` profile paths.

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
- Generated manifest check: `manifest_version` was `3`, extension name was `Assistant`, toolbar title was `Ask PannamOS`, and `update_url` was absent.
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
- Confirm the toolbar title is `Ask PannamOS`.
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

## Private Patched Launcher Validation: 2026-06-01

The active private setup now uses a separate private launcher instead of modifying the clean official BrowserOS profile by hand.

Launch command:

```powershell
Set-Location C:\Users\pannam\Desktop\BrowserOS
.\scripts\launch-private-browseros.ps1
```

This launcher uses:

- Official BrowserOS/Chromium host binary: `%LOCALAPPDATA%\Chromium\Application\chrome.exe`
- Private profile: `%LOCALAPPDATA%\BrowserOS-Private\profile`
- Private runtime data: `%LOCALAPPDATA%\BrowserOS-Private\data`
- Private local server: `http://127.0.0.1:9105`
- CDP port: `9005`
- Extension port: `9305`
- Patched extension build: `packages/browseros-agent/apps/agent/dist/chrome-mv3`

The launcher disables the official managed extension path and loads only the private unpacked extension. This fixed the repeated `PannamOS Agent is installing/updating` message during validation.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:9105/health
```

Expected healthy response includes `status: ok` and `cdpConnected: true`.

This is still a development launcher, not a packaged internal install. See [PHASE1_STATUS.md](PHASE1_STATUS.md) for the full current state and [DEV_RUNBOOK.md](DEV_RUNBOOK.md) for validation commands.
