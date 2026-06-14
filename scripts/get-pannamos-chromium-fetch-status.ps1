param(
  [string]$LogDir = (Join-Path $env:LOCALAPPDATA "PannamOS\logs"),
  [string]$ChromiumRoot = "C:\src\chromium",
  [int]$Tail = 60
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Write-Output ""
  Write-Output "== $Title =="
}

$pidFile = Join-Path $LogDir "chromium-fetch.pid"
$stdoutLog = Get-ChildItem -LiteralPath $LogDir -Filter "chromium-fetch-*.out.log" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$stderrLog = Get-ChildItem -LiteralPath $LogDir -Filter "chromium-fetch-*.err.log" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$chromiumSrc = Join-Path $ChromiumRoot "src"

Write-Section "Fetch Process"
if (Test-Path -LiteralPath $pidFile) {
  $fetchPid = [int](Get-Content -LiteralPath $pidFile | Select-Object -First 1)
  $process = Get-Process -Id $fetchPid -ErrorAction SilentlyContinue
  if ($process) {
    Write-Output "Status: running"
    Write-Output "PID: $($process.Id)"
    Write-Output "Started: $($process.StartTime)"
    Write-Output "CPU seconds: $([math]::Round($process.CPU, 1))"
    Write-Output "Working set MB: $([math]::Round($process.WorkingSet64 / 1MB, 1))"
  } else {
    Write-Output "Status: not running"
    Write-Output "Last PID: $fetchPid"
  }
} else {
  Write-Output "Status: unknown"
  Write-Output "PID file not found: $pidFile"
}

Write-Section "Disk"
$drive = (Split-Path -Qualifier $ChromiumRoot).TrimEnd("\")
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"
if ($disk) {
  Write-Output "$drive free GB: $([math]::Round($disk.FreeSpace / 1GB, 1))"
}

Write-Section "Checkout"
Write-Output "Chromium root: $ChromiumRoot"
Write-Output "Chromium src: $chromiumSrc"
Write-Output "Root exists: $(Test-Path -LiteralPath $ChromiumRoot)"
Write-Output "Src exists: $(Test-Path -LiteralPath $chromiumSrc)"
Write-Output "Src has .gn: $(Test-Path -LiteralPath (Join-Path $chromiumSrc ".gn"))"
Write-Output "Src has chrome dir: $(Test-Path -LiteralPath (Join-Path $chromiumSrc "chrome"))"
Write-Output "Src has build dir: $(Test-Path -LiteralPath (Join-Path $chromiumSrc "build"))"

if (Test-Path -LiteralPath $ChromiumRoot) {
  Get-ChildItem -LiteralPath $ChromiumRoot -Force |
    Select-Object Mode,Length,LastWriteTime,Name |
    Format-Table -AutoSize
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
