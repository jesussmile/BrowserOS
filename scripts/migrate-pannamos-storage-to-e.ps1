param(
  [string]$StorageRoot = "E:\PannamOS",
  [switch]$SkipDelete,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  return $full.TrimEnd('\')
}

function Assert-CanUseStorageRoot([string]$Root) {
  $resolved = Resolve-AbsolutePath $Root
  $drive = [System.IO.Path]::GetPathRoot($resolved)
  if (-not $drive -or -not (Test-Path -LiteralPath $drive)) {
    throw "Storage drive is unavailable: $drive"
  }
  if ($resolved -match '^[A-Za-z]:\\?$') {
    throw "Refusing to use a drive root directly: $resolved"
  }
  return $resolved
}

function Assert-PannamOSClosed {
  $running = Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "browseros_server.exe") -or
      ($_.Name -eq "chrome.exe" -and ($_.CommandLine -like "*\PannamOS\Application\*"))
    } |
    Select-Object ProcessId, Name, CommandLine

  if ($running -and -not $Force) {
    $summary = ($running | ForEach-Object { "$($_.Name) pid=$($_.ProcessId)" }) -join ", "
    throw "PannamOS must be closed before migration. Running: $summary"
  }
}

function Invoke-RobocopyChecked([string]$Source, [string]$Destination, [string[]]$ExtraArgs, [string]$LogPath) {
  if (-not (Test-Path -LiteralPath $Source)) {
    return $false
  }

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $args = @($Source, $Destination, "/E", "/COPY:DAT", "/DCOPY:DAT", "/R:2", "/W:2", "/NFL", "/NDL", "/NP", "/LOG:$LogPath") + $ExtraArgs
  & robocopy @args | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -gt 7) {
    throw "Robocopy failed from $Source to $Destination with exit code $exitCode. See $LogPath"
  }
  return $true
}

function Get-DirectorySize([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }
  $files = Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue
  return [int64](($files | Measure-Object Length -Sum).Sum)
}

function Assert-SafeDeleteTarget([string]$Target, [string]$ExpectedRoot) {
  $resolvedTarget = Resolve-AbsolutePath $Target
  $resolvedExpected = Resolve-AbsolutePath $ExpectedRoot
  if ($resolvedTarget -ne $resolvedExpected) {
    throw "Unexpected delete target: $resolvedTarget"
  }
  if (-not $resolvedTarget.Contains("\PannamOS\User Data")) {
    throw "Refusing to delete path outside old PannamOS User Data: $resolvedTarget"
  }
}

$storageRootPath = Assert-CanUseStorageRoot $StorageRoot
Assert-PannamOSClosed

$browserProfile = Join-Path $storageRootPath "BrowserProfile"
$serverState = Join-Path $storageRootPath "ServerState"
$outputs = Join-Path $storageRootPath "Outputs"
$logs = Join-Path $storageRootPath "Logs"
$backupRoot = Join-Path $storageRootPath "Backups"
$migrationId = "Migration-{0:yyyyMMdd-HHmmss}" -f (Get-Date)
$migrationDir = Join-Path $backupRoot $migrationId

$oldUserData = Join-Path $env:LOCALAPPDATA "PannamOS\User Data"
$oldServerState = Join-Path $oldUserData ".pannamos"

foreach ($dir in @(
  $browserProfile,
  $serverState,
  (Join-Path $outputs "GoalLoop"),
  (Join-Path $outputs "ToolCalls"),
  (Join-Path $outputs "Manual"),
  $logs,
  $migrationDir
)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$profileLog = Join-Path $migrationDir "browser-profile-robocopy.log"
$stateLog = Join-Path $migrationDir "server-state-robocopy.log"

$copiedProfile = Invoke-RobocopyChecked $oldUserData $browserProfile @("/XD", ".pannamos") $profileLog
$copiedState = Invoke-RobocopyChecked $oldServerState $serverState @() $stateLog

if ($copiedProfile -and -not (Test-Path -LiteralPath (Join-Path $browserProfile "Local State"))) {
  throw "Copied browser profile is missing Local State."
}

if ($copiedState) {
  $dbPath = Join-Path $serverState "db\pannamos.sqlite"
  if (-not (Test-Path -LiteralPath $dbPath)) {
    Write-Warning "Server state was copied, but $dbPath was not found."
  }
}

$manifest = [ordered]@{
  migratedAt = (Get-Date).ToString("o")
  storageRoot = $storageRootPath
  oldUserData = $oldUserData
  browserProfile = $browserProfile
  serverState = $serverState
  outputs = $outputs
  logs = $logs
  copiedProfile = $copiedProfile
  copiedState = $copiedState
  oldUserDataBytes = Get-DirectorySize $oldUserData
  browserProfileBytes = Get-DirectorySize $browserProfile
  serverStateBytes = Get-DirectorySize $serverState
  deletedOldUserData = $false
}

if ($copiedProfile -and -not $SkipDelete) {
  Assert-SafeDeleteTarget $oldUserData (Join-Path $env:LOCALAPPDATA "PannamOS\User Data")
  Remove-Item -LiteralPath $oldUserData -Recurse -Force
  $manifest.deletedOldUserData = $true
}

$manifestPath = Join-Path $migrationDir "migration-manifest.json"
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output "PannamOS storage migration complete."
Write-Output "Storage root: $storageRootPath"
Write-Output "Manifest: $manifestPath"
if ($SkipDelete) {
  Write-Output "Old C: User Data was left in place because -SkipDelete was supplied."
}
