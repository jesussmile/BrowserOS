param(
  [string]$ChromiumSrc = $env:CHROMIUM_SRC,
  [string]$EnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\extension-artifacts\pannamos-agent-env.ps1"),
  [string]$ChromiumEnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\chromium-build-env.ps1")
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$browserBuildRoot = Join-Path $repoRoot "packages\browseros"
$configPath = "build/config/release.windows.pannamos.local.yaml"

& (Join-Path $PSScriptRoot "test-pannamos-standalone-prereqs.ps1") `
  -ChromiumSrc $ChromiumSrc `
  -EnvHelper $EnvHelper `
  -ChromiumEnvHelper $ChromiumEnvHelper

if ($LASTEXITCODE -ne 0) {
  throw "PannamOS standalone preflight failed. Fix missing prerequisites before building."
}

. $EnvHelper
if (Test-Path $ChromiumEnvHelper) {
  . $ChromiumEnvHelper
}
if (!$ChromiumSrc -and $env:CHROMIUM_SRC) {
  $ChromiumSrc = $env:CHROMIUM_SRC
}
if (!$ChromiumSrc) {
  throw "CHROMIUM_SRC is not set. Run scripts\setup-pannamos-chromium-env.ps1 first."
}
$env:CHROMIUM_SRC = $ChromiumSrc

Push-Location $browserBuildRoot
try {
  python -m build.browseros build `
    --config $configPath `
    --chromium-src $ChromiumSrc
} finally {
  Pop-Location
}
