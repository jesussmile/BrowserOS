param(
  [string]$ChromiumSrc = $env:CHROMIUM_SRC,
  [string]$EnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\extension-artifacts\pannamos-agent-env.ps1"),
  [string]$ChromiumEnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\chromium-build-env.ps1")
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$browserBuildRoot = Join-Path $repoRoot "packages\browseros"
$serverResources = Join-Path $repoRoot "packages\browseros-agent\dist\prod\server\windows-x64\resources"
$missing = New-Object System.Collections.Generic.List[string]

function Pass {
  param([string]$Message)
  Write-Output "[OK] $Message"
}

function Fail {
  param([string]$Message)
  Write-Output "[MISSING] $Message"
  $script:missing.Add($Message) | Out-Null
}

if (Test-Path $EnvHelper) {
  . $EnvHelper
  Pass "Loaded PannamOS extension env helper: $EnvHelper"
} else {
  Fail "PannamOS extension env helper not found: $EnvHelper"
}

if (Test-Path $ChromiumEnvHelper) {
  . $ChromiumEnvHelper
  Pass "Loaded Chromium build env helper: $ChromiumEnvHelper"
  if (!$ChromiumSrc -and $env:CHROMIUM_SRC) {
    $ChromiumSrc = $env:CHROMIUM_SRC
  }
} else {
  Fail "Chromium build env helper not found: $ChromiumEnvHelper"
}

if ($env:PANNAMOS_AGENT_CRX -and (Test-Path $env:PANNAMOS_AGENT_CRX)) {
  Pass "PANNAMOS_AGENT_CRX exists: $env:PANNAMOS_AGENT_CRX"
} else {
  Fail "PANNAMOS_AGENT_CRX is not set or does not exist"
}

if ($env:PANNAMOS_AGENT_EXTENSION_ID -and $env:PANNAMOS_AGENT_EXTENSION_ID -match '^[a-p]{32}$') {
  Pass "PANNAMOS_AGENT_EXTENSION_ID is valid: $env:PANNAMOS_AGENT_EXTENSION_ID"
} else {
  Fail "PANNAMOS_AGENT_EXTENSION_ID is missing or invalid"
}

if ($env:PANNAMOS_AGENT_CRX -and $env:PANNAMOS_AGENT_EXTENSION_ID) {
  Push-Location $browserBuildRoot
  try {
    $validation = @'
import os
from pathlib import Path
from build.modules.extensions.pannamos_agent_extension import _read_crx_extension_id
actual = _read_crx_extension_id(Path(os.environ["PANNAMOS_AGENT_CRX"]))
expected = os.environ["PANNAMOS_AGENT_EXTENSION_ID"]
if actual != expected:
    raise SystemExit(f"CRX ID {actual} does not match env ID {expected}")
print(actual)
'@ | python -
    if ($LASTEXITCODE -eq 0) {
      Pass "CRX extension ID matches env: $validation"
    } else {
      Fail "CRX extension ID validation failed"
    }
  } finally {
    Pop-Location
  }
}

if (Test-Path $serverResources) {
  Pass "Local Windows server resources exist: $serverResources"
} else {
  Fail "Local Windows server resources missing: $serverResources"
}

if ($ChromiumSrc -and (Test-Path $ChromiumSrc)) {
  $requiredChromiumPaths = @(
    (Join-Path $ChromiumSrc ".gn"),
    (Join-Path $ChromiumSrc "chrome"),
    (Join-Path $ChromiumSrc "build")
  )
  $missingChromiumPaths = @($requiredChromiumPaths | Where-Object { !(Test-Path $_) })
  if ($missingChromiumPaths.Count -eq 0) {
    Pass "CHROMIUM_SRC looks like a Chromium source checkout: $ChromiumSrc"
  } else {
    Fail "CHROMIUM_SRC is set but does not look complete: $ChromiumSrc"
  }
} else {
  Fail "CHROMIUM_SRC is not set or does not exist"
}

foreach ($tool in @("autoninja", "gn", "ninja")) {
  $command = Get-Command $tool -ErrorAction SilentlyContinue
  if ($command) {
    Pass "$tool is available: $($command.Source)"
  } else {
    Fail "$tool is not available on PATH"
  }
}

if ($missing.Count -gt 0) {
  Write-Output ""
  Write-Output "PannamOS standalone preflight failed with $($missing.Count) missing item(s)."
  exit 1
}

Write-Output ""
Write-Output "PannamOS standalone preflight passed."
