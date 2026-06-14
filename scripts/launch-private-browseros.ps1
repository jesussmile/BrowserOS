param(
  [switch]$ServerOnly,
  [string]$StorageRoot = "E:\PannamOS\Dev"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentRoot = Join-Path $repoRoot "packages\browseros-agent"
$extensionDir = Join-Path $agentRoot "apps\agent\dist\chrome-mv3"
$browserExe = Join-Path $env:LOCALAPPDATA "PannamOS\Application\chrome.exe"
if (!(Test-Path $browserExe)) {
  $browserExe = Join-Path $env:LOCALAPPDATA "Chromium\Application\chrome.exe"
}
$runtimeRoot = $StorageRoot
$dataDir = Join-Path $runtimeRoot "data"
$profileDir = Join-Path $runtimeRoot "BrowserProfile"
$executionDir = Join-Path $runtimeRoot "ServerState"
$outputsDir = Join-Path $runtimeRoot "Outputs"
$resourcesDir = Join-Path $runtimeRoot "resources"
$logsDir = Join-Path $runtimeRoot "Logs"

$cdpPort = 9005
$serverPort = 9105
$extensionPort = 9305

if (!(Test-Path $browserExe)) {
  throw "PannamOS/Chromium binary not found at $browserExe"
}

if (!(Test-Path $extensionDir)) {
  throw "Patched extension build not found at $extensionDir. Run: cd $agentRoot; `$env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL='true'; `$env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE='true'; bun run build:agent"
}

foreach ($path in @($runtimeRoot, $dataDir, $profileDir, $executionDir, $outputsDir, $resourcesDir, $logsDir)) {
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

$bun = Get-Command bun -ErrorAction Stop
$serverListening = Get-NetTCPConnection -LocalPort $serverPort -State Listen -ErrorAction SilentlyContinue

if (!$serverListening) {
  $env:BROWSEROS_DIR = $dataDir
  $env:PANNAMOS_STORAGE_ROOT = $runtimeRoot
  $env:PANNAMOS_OUTPUTS_DIR = $outputsDir
  $env:NODE_ENV = "development"

  $serverArgs = @(
    "apps/server/src/index.ts",
    "--cdp-port", "$cdpPort",
    "--server-port", "$serverPort",
    "--storage-root", $runtimeRoot,
    "--resources-dir", $resourcesDir,
    "--execution-dir", $executionDir
    "--outputs-dir", $outputsDir
  )

  Start-Process `
    -FilePath $bun.Source `
    -ArgumentList $serverArgs `
    -WorkingDirectory $agentRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logsDir "server.out.log") `
    -RedirectStandardError (Join-Path $logsDir "server.err.log") | Out-Null

  Start-Sleep -Seconds 2
}

if ($ServerOnly) {
  Write-Output "Private PannamOS server is running on http://127.0.0.1:$serverPort"
  exit 0
}

$browserArgs = @(
  "--user-data-dir=$profileDir",
  "--pannamos-storage-root=$runtimeRoot",
  "--pannamos-user-data-dir=$profileDir",
  "--pannamos-execution-dir=$executionDir",
  "--remote-debugging-port=$cdpPort",
  "--disable-browseros-server",
  # Match the patched browser's local dev mode: the private agent is loaded explicitly
  # from dist/chrome-mv3 below, so the browser should not wait on the managed
  # upstream extension updater/CDN path.
  "--disable-browseros-extensions",
  "--browseros-mcp-port=$serverPort",
  "--browseros-server-port=$serverPort",
  "--browseros-proxy-port=$serverPort",
  "--browseros-extension-port=$extensionPort",
  # Keep the fallback upstream CDN update/config channel inert in this private
  # build. The managed extension path is disabled above for local dev loading.
  "--browseros-extensions-url=https://browseros.invalid/extensions.json",
  # Keep chrome://browseros/* virtual routes disabled for this dev-loaded setup.
  # Start on a plain browser page instead of about:newtab/onboarding because the
  # extension-backed New Tab renderer can crash in the unpacked dev-extension
  # setup. The agent extension remains loaded for the Assistant side panel.
  "--browseros-disable-url-overrides",
  # Pair this with --load-extension so Chromium does not silently skip the
  # unpacked private agent when a profile already has extension state.
  "--disable-extensions-except=$extensionDir",
  "--load-extension=$extensionDir",
  "--disable-breakpad",
  "--disable-crash-reporter",
  "--disable-session-crashed-bubble",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
)

Start-Process -FilePath $browserExe -ArgumentList $browserArgs | Out-Null

Write-Output "Private PannamOS launched with profile: $profileDir"
