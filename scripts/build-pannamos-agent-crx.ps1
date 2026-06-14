param(
  [string]$BrowserExe = (Join-Path $env:LOCALAPPDATA "Chromium\Application\chrome.exe"),
  [string]$KeyPath = (Join-Path $env:LOCALAPPDATA "PannamOS\extension-key\pannamos-agent.pem"),
  [string]$ArtifactsDir = (Join-Path $env:LOCALAPPDATA "PannamOS\extension-artifacts"),
  [switch]$RegenerateKey,
  [switch]$SkipAgentBuild,
  [switch]$DisableNewTabOverride
)

$ErrorActionPreference = "Stop"

function Set-PrivateKeyAcl {
  param([string]$Path)

  try {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    icacls $Path /inheritance:r /grant:r "${identity}:(R,W)" | Out-Null
  } catch {
    Write-Warning "Could not restrict key ACL automatically: $($_.Exception.Message)"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$agentRoot = Join-Path $repoRoot "packages\browseros-agent"
$agentAppRoot = Join-Path $agentRoot "apps\agent"
$extensionDir = Join-Path $agentRoot "apps\agent\dist\chrome-mv3"
$keyHelper = Join-Path $PSScriptRoot "pannamos-extension-key.mjs"

if (!(Test-Path $agentRoot)) {
  throw "Agent workspace not found: $agentRoot"
}
if (!(Test-Path $agentAppRoot)) {
  throw "Agent app workspace not found: $agentAppRoot"
}
if (!(Test-Path $BrowserExe)) {
  throw "Browser executable not found: $BrowserExe"
}
if (!(Test-Path $keyHelper)) {
  throw "Key helper not found: $keyHelper"
}

$keyDir = Split-Path -Parent $KeyPath
New-Item -ItemType Directory -Force -Path $keyDir | Out-Null
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null

$bun = Get-Command bun -ErrorAction Stop

$keyArgs = @($keyHelper, "--key", $KeyPath)
if ($RegenerateKey) {
  $keyArgs += "--regenerate"
}

$keyJson = & $bun.Source @keyArgs
if ($LASTEXITCODE -ne 0) {
  throw "Extension key helper failed with exit code $LASTEXITCODE"
}
$keyInfo = $keyJson | ConvertFrom-Json

if ($keyInfo.generated) {
  Set-PrivateKeyAcl -Path $KeyPath
  Write-Output "Generated private PannamOS extension key: $KeyPath"
} else {
  Write-Output "Using existing private PannamOS extension key: $KeyPath"
}

$publicKeyBase64 = [string]$keyInfo.publicKeyBase64
$extensionId = [string]$keyInfo.extensionId

if (!$SkipAgentBuild) {
  Push-Location $agentAppRoot
  $oldManifestKey = $env:PANNAMOS_AGENT_EXTENSION_KEY
  $oldDisableUpdate = $env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL
  $oldDisableNewTab = $env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE
  $oldNodeOptions = $env:NODE_OPTIONS
  $oldDebug = $env:DEBUG

  try {
    $env:PANNAMOS_AGENT_EXTENSION_KEY = $publicKeyBase64
    $env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL = "true"
    $env:NODE_OPTIONS = (($oldNodeOptions, "--max-old-space-size=8192") -join " ").Trim()
    $env:DEBUG = ""
    if ($DisableNewTabOverride) {
      $env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE = "true"
    }
    & $bun.Source "node_modules/.bin/wxt" build
    if ($LASTEXITCODE -ne 0) {
      throw "wxt build failed with exit code $LASTEXITCODE"
    }
  } finally {
    if ($null -eq $oldManifestKey) { Remove-Item Env:PANNAMOS_AGENT_EXTENSION_KEY -ErrorAction SilentlyContinue } else { $env:PANNAMOS_AGENT_EXTENSION_KEY = $oldManifestKey }
    if ($null -eq $oldDisableUpdate) { Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL -ErrorAction SilentlyContinue } else { $env:BROWSEROS_PRIVATE_DISABLE_UPDATE_URL = $oldDisableUpdate }
    if ($null -eq $oldDisableNewTab) { Remove-Item Env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE -ErrorAction SilentlyContinue } else { $env:BROWSEROS_PRIVATE_DISABLE_NEWTAB_OVERRIDE = $oldDisableNewTab }
    if ($null -eq $oldNodeOptions) { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue } else { $env:NODE_OPTIONS = $oldNodeOptions }
    if ($null -eq $oldDebug) { Remove-Item Env:DEBUG -ErrorAction SilentlyContinue } else { $env:DEBUG = $oldDebug }
    Pop-Location
  }
}

$manifestPath = Join-Path $extensionDir "manifest.json"
if (!(Test-Path $manifestPath)) {
  throw "Agent extension build not found: $extensionDir"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.key -ne $publicKeyBase64) {
  throw "Built manifest key does not match $KeyPath. Rebuild without -SkipAgentBuild."
}

$defaultCrxPath = Join-Path (Split-Path -Parent $extensionDir) ((Split-Path -Leaf $extensionDir) + ".crx")
if (Test-Path $defaultCrxPath) {
  Remove-Item -LiteralPath $defaultCrxPath -Force
}

$packProfileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("pannamos-extension-pack-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $packProfileDir | Out-Null
$packArgs = @(
  "--user-data-dir=$packProfileDir",
  "--no-first-run",
  "--no-default-browser-check",
  "--pack-extension=$extensionDir",
  "--pack-extension-key=$KeyPath"
)
$packProcess = Start-Process `
  -FilePath $BrowserExe `
  -ArgumentList $packArgs `
  -Wait `
  -PassThru `
  -WindowStyle Hidden
$packExitCode = $packProcess.ExitCode
Remove-Item -LiteralPath $packProfileDir -Recurse -Force -ErrorAction SilentlyContinue
if (!(Test-Path $defaultCrxPath)) {
  if ($packExitCode -ne 0) {
    throw "Chrome extension packing failed with exit code $packExitCode"
  }
  throw "Expected packed CRX was not created: $defaultCrxPath"
}
if ($packExitCode -ne 0) {
  Write-Warning "Chrome extension pack returned exit code $packExitCode, but CRX output was created."
}

$crxPath = Join-Path $ArtifactsDir "pannamos-agent-$extensionId.crx"
Copy-Item -LiteralPath $defaultCrxPath -Destination $crxPath -Force

$envHelper = Join-Path $ArtifactsDir "pannamos-agent-env.ps1"
$helperLines = @(
  "`$env:PANNAMOS_AGENT_CRX='$crxPath'",
  "`$env:PANNAMOS_AGENT_EXTENSION_ID='$extensionId'"
)
[System.IO.File]::WriteAllText($envHelper, ($helperLines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

Write-Output "PannamOS agent CRX: $crxPath"
Write-Output "PannamOS agent extension ID: $extensionId"
Write-Output "Build env helper: $envHelper"
Write-Output "Use before browser build: . '$envHelper'"
