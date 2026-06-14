param(
  [string]$DepotToolsDir = (Join-Path $env:LOCALAPPDATA "PannamOS\depot_tools"),
  [string]$ChromiumRoot = "C:\src\chromium",
  [string]$EnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\chromium-build-env.ps1"),
  [switch]$FetchChromium,
  [switch]$RunGclientSync,
  [switch]$UpdateDepotTools,
  [switch]$PersistUserPath
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Output "[PannamOS] $Message"
}

function Test-VisualStudio {
  $msbuild = Get-ChildItem "C:\Program Files\Microsoft Visual Studio" -Recurse -Filter MSBuild.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1
  return $null -ne $msbuild
}

function Test-WindowsSdk {
  return Test-Path "C:\Program Files (x86)\Windows Kits\10\bin"
}

function Add-ToCurrentPath {
  param([string]$PathToAdd)
  $parts = $env:PATH -split ';' | Where-Object { $_ }
  if ($parts -notcontains $PathToAdd) {
    $env:PATH = "$PathToAdd;$env:PATH"
  }
}

function Add-ToUserPath {
  param([string]$PathToAdd)
  $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
  $parts = ($userPath -split ';') | Where-Object { $_ }
  if ($parts -contains $PathToAdd) {
    return
  }
  $newPath = if ($userPath) { "$PathToAdd;$userPath" } else { $PathToAdd }
  [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
}

$pannamosRoot = Join-Path $env:LOCALAPPDATA "PannamOS"
$chromiumSrc = Join-Path $ChromiumRoot "src"

New-Item -ItemType Directory -Force -Path $pannamosRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $EnvHelper) | Out-Null

$git = Get-Command git -ErrorAction Stop

if (!(Test-Path $DepotToolsDir)) {
  Write-Step "Cloning depot_tools to $DepotToolsDir"
  & $git.Source clone https://chromium.googlesource.com/chromium/tools/depot_tools.git $DepotToolsDir
  if ($LASTEXITCODE -ne 0) {
    throw "depot_tools clone failed with exit code $LASTEXITCODE"
  }
} elseif ($UpdateDepotTools) {
  Write-Step "Updating depot_tools at $DepotToolsDir"
  Push-Location $DepotToolsDir
  try {
    & $git.Source pull --ff-only
    if ($LASTEXITCODE -ne 0) {
      throw "depot_tools update failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Step "Using existing depot_tools at $DepotToolsDir"
}

Add-ToCurrentPath -PathToAdd $DepotToolsDir
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = "0"
$env:CHROMIUM_SRC = $chromiumSrc

if ($PersistUserPath) {
  Add-ToUserPath -PathToAdd $DepotToolsDir
  [Environment]::SetEnvironmentVariable("DEPOT_TOOLS_WIN_TOOLCHAIN", "0", "User")
  [Environment]::SetEnvironmentVariable("CHROMIUM_SRC", $chromiumSrc, "User")
}

$helperLines = @(
  "`$env:DEPOT_TOOLS_WIN_TOOLCHAIN='0'",
  "`$env:CHROMIUM_SRC='$chromiumSrc'",
  "`$depotTools='$DepotToolsDir'",
  "if (`$env:PATH -split ';' -notcontains `$depotTools) { `$env:PATH = ""`$depotTools;`$env:PATH"" }"
)
[System.IO.File]::WriteAllText(
  $EnvHelper,
  ($helperLines -join [Environment]::NewLine) + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Step "Wrote Chromium build env helper: $EnvHelper"

if (!(Test-VisualStudio)) {
  Write-Warning "Visual Studio was not detected under C:\Program Files\Microsoft Visual Studio"
}
if (!(Test-WindowsSdk)) {
  Write-Warning "Windows 10 SDK was not detected under C:\Program Files (x86)\Windows Kits\10"
}

if ($FetchChromium) {
  New-Item -ItemType Directory -Force -Path $ChromiumRoot | Out-Null
  Push-Location $ChromiumRoot
  try {
    if (!(Test-Path $chromiumSrc)) {
      $gclientConfig = Join-Path $ChromiumRoot ".gclient"
      if (Test-Path $gclientConfig) {
        Write-Step "Found .gclient without src; resuming Chromium checkout with gclient sync --nohooks."
        & gclient sync --nohooks
        if ($LASTEXITCODE -ne 0) {
          throw "gclient sync --nohooks failed with exit code $LASTEXITCODE"
        }
      } else {
        Write-Step "Fetching Chromium into $ChromiumRoot. This can take hours and hundreds of GB."
        & fetch --nohooks chromium
        if ($LASTEXITCODE -ne 0) {
          throw "fetch chromium failed with exit code $LASTEXITCODE"
        }
      }
    } else {
      Write-Step "Chromium source already exists: $chromiumSrc"
    }
  } finally {
    Pop-Location
  }
}

if ($RunGclientSync) {
  if (!(Test-Path $chromiumSrc)) {
    throw "Cannot run gclient sync because Chromium source is missing: $chromiumSrc"
  }
  Push-Location $chromiumSrc
  try {
    Write-Step "Running gclient sync in $chromiumSrc"
    & gclient sync
    if ($LASTEXITCODE -ne 0) {
      throw "gclient sync failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Write-Output ""
Write-Output "PannamOS Chromium environment helper ready:"
Write-Output "  . '$EnvHelper'"
Write-Output ""
Write-Output "Current CHROMIUM_SRC:"
Write-Output "  $chromiumSrc"
