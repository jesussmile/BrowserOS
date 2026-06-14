param(
  [string]$LogDir = (Join-Path $env:LOCALAPPDATA "PannamOS\logs"),
  [string]$ChromiumEnvHelper = (Join-Path $env:LOCALAPPDATA "PannamOS\chromium-build-env.ps1"),
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$Tail = 80
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Write-Output ""
  Write-Output "== $Title =="
}

if (Test-Path -LiteralPath $ChromiumEnvHelper) {
  . $ChromiumEnvHelper
}

$pidFile = Join-Path $LogDir "pannamos-build.pid"
$stdoutLog = Get-ChildItem -LiteralPath $LogDir -Filter "pannamos-build-*.out.log" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$stderrLog = Get-ChildItem -LiteralPath $LogDir -Filter "pannamos-build-*.err.log" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

Write-Section "Build Process"
if (Test-Path -LiteralPath $pidFile) {
  $buildPid = [int](Get-Content -LiteralPath $pidFile | Select-Object -First 1)
  $process = Get-Process -Id $buildPid -ErrorAction SilentlyContinue
  if ($process) {
    Write-Output "Status: running"
    Write-Output "PID: $($process.Id)"
    Write-Output "Started: $($process.StartTime)"
    Write-Output "CPU seconds: $([math]::Round($process.CPU, 1))"
    Write-Output "Working set MB: $([math]::Round($process.WorkingSet64 / 1MB, 1))"
  } else {
    Write-Output "Status: not running"
    Write-Output "Last PID: $buildPid"
  }
} else {
  Write-Output "Status: unknown"
  Write-Output "PID file not found: $pidFile"
}

Write-Section "Disk"
$chromiumSrc = $env:CHROMIUM_SRC
if ($chromiumSrc) {
  $drive = (Split-Path -Qualifier $chromiumSrc).TrimEnd("\")
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"
  if ($disk) {
    Write-Output "$drive free GB: $([math]::Round($disk.FreeSpace / 1GB, 1))"
  }
}

Write-Section "Build Paths"
Write-Output "Repo root: $RepoRoot"
Write-Output "CHROMIUM_SRC: $chromiumSrc"
if ($chromiumSrc) {
  $outDir = Join-Path $chromiumSrc "out\Default_x64"
  Write-Output "Output dir: $outDir"
  Write-Output "Output dir exists: $(Test-Path -LiteralPath $outDir)"
  Write-Output "mini_installer exists: $(Test-Path -LiteralPath (Join-Path $outDir "mini_installer.exe"))"
  Write-Output "setup exists: $(Test-Path -LiteralPath (Join-Path $outDir "setup.exe"))"
}

$distDir = Join-Path $RepoRoot "packages\browseros\dist"
Write-Output "Dist dir: $distDir"
if (Test-Path -LiteralPath $distDir) {
  Get-ChildItem -LiteralPath $distDir -Force |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 12 Mode,Length,LastWriteTime,Name |
    Format-Table -AutoSize
} else {
  Write-Output "Dist dir does not exist yet."
}

Write-Section "Stdout"
if ($stdoutLog) {
  Write-Output $stdoutLog.FullName
  Get-Content -LiteralPath $stdoutLog.FullName -Tail $Tail
} else {
  Write-Output "No stdout log found."
}

Write-Section "Stderr"
if ($stderrLog -and $stderrLog.Length -gt 0) {
  Write-Output $stderrLog.FullName
  Get-Content -LiteralPath $stderrLog.FullName -Tail $Tail
} elseif ($stderrLog) {
  Write-Output "$($stderrLog.FullName) is empty."
} else {
  Write-Output "No stderr log found."
}
