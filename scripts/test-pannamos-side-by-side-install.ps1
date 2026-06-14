param(
  [string]$InstallerPath,
  [switch]$Install,
  [switch]$Launch,
  [int]$LaunchWaitSeconds = 8
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$missing = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Pass {
  param([string]$Message)
  Write-Output "[OK] $Message"
}

function Warn {
  param([string]$Message)
  Write-Output "[WARN] $Message"
  $script:warnings.Add($Message) | Out-Null
}

function Fail {
  param([string]$Message)
  Write-Output "[MISSING] $Message"
  $script:missing.Add($Message) | Out-Null
}

function Find-LatestInstaller {
  $releaseRoot = Join-Path $repoRoot "packages\browseros\releases"
  if (!(Test-Path $releaseRoot)) {
    return $null
  }

  Get-ChildItem -Path $releaseRoot -Recurse -File -Filter "PannamOS_v*_installer.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Get-RegistryMatches {
  param(
    [string[]]$Roots,
    [string]$Pattern
  )

  $matches = @()
  foreach ($root in $Roots) {
    if (!(Test-Path $root)) {
      continue
    }
    $matches += Get-ChildItem $root -ErrorAction SilentlyContinue |
      ForEach-Object {
        try {
          $item = Get-ItemProperty $_.PSPath -ErrorAction Stop
          if (($item.DisplayName -and $item.DisplayName -match $Pattern) -or
              ($item.PSChildName -and $item.PSChildName -match $Pattern)) {
            $_
          }
        } catch {
          $null
        }
      }
  }
  return $matches
}

function Get-ProgIdPrefixMatches {
  param([string]$Prefix)

  $roots = @(
    "HKCU:\Software\Classes",
    "HKLM:\Software\Classes"
  )
  $matches = @()
  foreach ($root in $roots) {
    if (!(Test-Path $root)) {
      continue
    }
    $matches += Get-ChildItem $root -ErrorAction SilentlyContinue |
      Where-Object {
        $_.PSChildName -eq $Prefix -or $_.PSChildName -like "$Prefix.*"
      }
  }
  return $matches
}

if (!$InstallerPath) {
  $latestInstaller = Find-LatestInstaller
  if ($latestInstaller) {
    $InstallerPath = $latestInstaller.FullName
  }
}

if ($InstallerPath) {
  if (Test-Path $InstallerPath) {
    $installerName = Split-Path -Leaf $InstallerPath
    if ($installerName -match '^PannamOS_v[0-9]+(\.[0-9]+){2,3}_(x64|arm64|x86)_installer\.exe$') {
      Pass "Installer artifact name is PannamOS-specific: $installerName"
    } else {
      Fail "Installer artifact name is not PannamOS-specific: $installerName"
    }
  } else {
    Fail "Installer not found: $InstallerPath"
  }
} else {
  Fail "No PannamOS installer was provided or found under packages\browseros\releases"
}

if ($Install) {
  if (!$InstallerPath -or !(Test-Path $InstallerPath)) {
    throw "Cannot install because the PannamOS installer is missing."
  }

  Write-Output "[PannamOS] Running installer. Accept Windows prompts if they appear."
  $process = Start-Process -FilePath $InstallerPath -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -eq 0) {
    Pass "Installer exited successfully"
  } else {
    Fail "Installer exited with code $($process.ExitCode)"
  }
}

$pannamosInstallDir = Join-Path $env:LOCALAPPDATA "PannamOS\Application"
$chromiumInstallDir = Join-Path $env:LOCALAPPDATA "Chromium\Application"
$browserOsInstallDir = Join-Path $env:LOCALAPPDATA "BrowserOS\Application"

if (Test-Path $pannamosInstallDir) {
  Pass "PannamOS install path exists: $pannamosInstallDir"
} else {
  Fail "PannamOS install path does not exist: $pannamosInstallDir"
}

if ($pannamosInstallDir -ne $chromiumInstallDir) {
  Pass "PannamOS install path is separate from Chromium"
} else {
  Fail "PannamOS install path resolves to Chromium path"
}

if (Test-Path $browserOsInstallDir) {
  Pass "Official BrowserOS install path still exists: $browserOsInstallDir"
} else {
  Warn "Official BrowserOS install path was not found for side-by-side confirmation: $browserOsInstallDir"
}

$pannamosExe = @(
  (Join-Path $pannamosInstallDir "PannamOS.exe"),
  (Join-Path $pannamosInstallDir "chrome.exe")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($pannamosExe) {
  Pass "PannamOS executable exists: $pannamosExe"
} else {
  Fail "No PannamOS executable found under $pannamosInstallDir"
}

$pannamosServerExe = Get-ChildItem -Path $pannamosInstallDir -Recurse -File `
  -Filter "browseros_server.exe" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -like "*\PannamOSServer\default\resources\bin\browseros_server.exe"
  } |
  Select-Object -First 1

if ($pannamosServerExe) {
  Pass "PannamOS server resources are installed: $($pannamosServerExe.FullName)"
} else {
  Fail "PannamOS server resources are not installed under $pannamosInstallDir"
}

$pannamosServerResourcesDir = $null
if ($pannamosServerExe) {
  $pannamosServerResourcesDir = Split-Path -Parent (Split-Path -Parent $pannamosServerExe.FullName)
}

if ($pannamosServerResourcesDir) {
  $pannamosServerMigrationsDir = Join-Path $pannamosServerResourcesDir "db\migrations"
  $pannamosServerMigrations = @()
  if (Test-Path $pannamosServerMigrationsDir) {
    $pannamosServerMigrations = @(Get-ChildItem -Path $pannamosServerMigrationsDir `
      -File -Filter "*.sql" -ErrorAction SilentlyContinue)
  }

  if ($pannamosServerMigrations.Count -gt 0) {
    Pass "PannamOS server DB migrations are installed: $pannamosServerMigrationsDir"
  } else {
    Fail "PannamOS server DB migrations are not installed under $pannamosServerMigrationsDir"
  }

  $pannamosServerMigrationsJournal = Join-Path $pannamosServerMigrationsDir "meta\_journal.json"
  if (Test-Path $pannamosServerMigrationsJournal) {
    Pass "PannamOS server DB migration metadata is installed"
  } else {
    Fail "PannamOS server DB migration metadata is not installed: $pannamosServerMigrationsJournal"
  }
} else {
  Fail "Cannot validate PannamOS server DB migrations because server resources are missing"
}

$browserOsServerDirs = @(Get-ChildItem -Path $pannamosInstallDir -Recurse -Directory `
  -Filter "BrowserOSServer" -ErrorAction SilentlyContinue)
if ($browserOsServerDirs.Count -gt 0) {
  Fail "PannamOS install contains BrowserOSServer directory"
} else {
  Pass "PannamOS install does not contain BrowserOSServer resources"
}

$pannamosAgentCrx = Get-ChildItem -Path $pannamosInstallDir -Recurse -File `
  -Filter "omafobdjppghabboefpchoelhdkekbfp.crx" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -like "*\browseros_extensions\omafobdjppghabboefpchoelhdkekbfp.crx"
  } |
  Select-Object -First 1

if ($pannamosAgentCrx) {
  Pass "PannamOS bundled agent CRX is installed: $($pannamosAgentCrx.FullName)"
} else {
  Fail "PannamOS bundled agent CRX is not installed under $pannamosInstallDir"
}

$pannamosAgentManifest = Get-ChildItem -Path $pannamosInstallDir -Recurse -File `
  -Filter "bundled_extensions.json" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -like "*\browseros_extensions\bundled_extensions.json"
  } |
  Select-Object -First 1

if ($pannamosAgentManifest) {
  Pass "PannamOS bundled extension manifest is installed: $($pannamosAgentManifest.FullName)"
} else {
  Fail "PannamOS bundled extension manifest is not installed under $pannamosInstallDir"
}

$pannamosAgentExtensionId = $null
if ($pannamosAgentManifest) {
  try {
    $manifestJson = Get-Content -Raw -Path $pannamosAgentManifest.FullName | ConvertFrom-Json
    $pannamosAgentExtensionId = $manifestJson.PSObject.Properties.Name | Select-Object -First 1
    if ($pannamosAgentExtensionId -match '^[a-p]{32}$') {
      Pass "PannamOS bundled extension ID is private-format: $pannamosAgentExtensionId"
    } else {
      Fail "PannamOS bundled extension ID is invalid: $pannamosAgentExtensionId"
    }
  } catch {
    Fail "Could not parse PannamOS bundled extension manifest: $($pannamosAgentManifest.FullName)"
  }
}

$upstreamBrowserOSExtensionIds = @(
  "bflpfmnmnokmjhmgnolecpppdbdophmk",
  "adlpneommgkgeanpaekgoaolcpncohkf",
  "nlnihljpboknmfagkikhkdblbedophja",
  "djhdjhlnljbjgejbndockeedocneiaei"
)

if ($pannamosAgentExtensionId -and
    ($upstreamBrowserOSExtensionIds -contains $pannamosAgentExtensionId)) {
  Fail "PannamOS bundled extension ID is an upstream BrowserOS ID: $pannamosAgentExtensionId"
}

$browserProgIds = @(Get-ProgIdPrefixMatches -Prefix "PannamOSHTML")
if ($browserProgIds.Count -gt 0) {
  $names = ($browserProgIds | Select-Object -ExpandProperty PSChildName) -join ", "
  Pass "PannamOS browser ProgID is registered: $names"
} else {
  Fail "PannamOS browser ProgID is not registered"
}

$pdfProgIds = @(Get-ProgIdPrefixMatches -Prefix "PannamOSPDF")
if ($pdfProgIds.Count -gt 0) {
  $names = ($pdfProgIds | Select-Object -ExpandProperty PSChildName) -join ", "
  Pass "PannamOS PDF ProgID is registered: $names"
} else {
  Fail "PannamOS PDF ProgID is not registered"
}

if ((Test-Path "HKCU:\Software\Classes\pannamos") -or
    (Test-Path "HKLM:\Software\Classes\pannamos")) {
  Pass "PannamOS direct-launch protocol is registered"
} else {
  Fail "PannamOS direct-launch protocol is not registered"
}

if ((Test-Path "HKCU:\Software\Classes\ChromiumHTML") -or
    (Test-Path "HKLM:\Software\Classes\ChromiumHTML")) {
  Warn "Chromium ProgID exists on this machine; verify it belongs to Chromium, not PannamOS"
}

$uninstallRoots = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)
$uninstallMatches = @(Get-RegistryMatches -Roots $uninstallRoots -Pattern "PannamOS")
if ($uninstallMatches.Count -gt 0) {
  Pass "PannamOS uninstall entry exists"
} else {
  Fail "PannamOS uninstall entry was not found"
}

$uninstallEntries = @()
foreach ($entry in $uninstallMatches) {
  try {
    $item = Get-ItemProperty $entry.PSPath -ErrorAction Stop
    $uninstallEntries += [PSCustomObject]@{
      Key = $entry.PSChildName
      DisplayName = $item.DisplayName
      InstallLocation = $item.InstallLocation
    }
  } catch {
    Warn "Could not read uninstall entry properties: $($entry.PSChildName)"
  }
}

$pannamosDisplayNames = @($uninstallEntries | Where-Object { $_.DisplayName -eq "PannamOS" })
if ($pannamosDisplayNames.Count -gt 0) {
  Pass "PannamOS uninstall DisplayName is PannamOS"
} elseif ($uninstallEntries.Count -gt 0) {
  $names = ($uninstallEntries | ForEach-Object { "$($_.Key)=$($_.DisplayName)" }) -join ", "
  Fail "PannamOS uninstall DisplayName is not PannamOS: $names"
}

$browserOsDisplayNames = @(
  $uninstallEntries | Where-Object {
    $_.Key -eq "PannamOS" -and $_.DisplayName -match "BrowserOS"
  }
)
if ($browserOsDisplayNames.Count -gt 0) {
  Fail "PannamOS uninstall entry still uses BrowserOS DisplayName"
}

if ($Launch) {
  if (!$pannamosExe) {
    throw "Cannot launch because no PannamOS executable was found."
  }

  $profileDir = Join-Path $env:LOCALAPPDATA "PannamOS\User Data"
  $pannamosRuntimeDir = Join-Path $profileDir ".pannamos"
  $browserOsRuntimeDir = Join-Path $profileDir ".browseros"
  $pannamosVersionsDir = Join-Path $pannamosRuntimeDir "versions"
  $pannamosPendingUpdateDir = Join-Path $pannamosRuntimeDir "pending_update"
  $process = Start-Process -FilePath $pannamosExe -ArgumentList @(
    "--no-first-run",
    "--user-data-dir=""$profileDir""",
    "about:blank"
  ) -PassThru
  Start-Sleep -Seconds $LaunchWaitSeconds
  if (!$process.HasExited) {
    Pass "PannamOS launched with local profile: $profileDir"
    $process.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 2
    if (!$process.HasExited) {
      Stop-Process -Id $process.Id -Force
    }
  } else {
    Fail "PannamOS process exited before launch validation completed"
  }

  if (Test-Path $profileDir) {
    Pass "PannamOS profile path exists: $profileDir"
  } else {
    Fail "PannamOS profile path was not created: $profileDir"
  }

  if (Test-Path $pannamosRuntimeDir) {
    Pass "PannamOS server runtime path exists: $pannamosRuntimeDir"
  } else {
    Fail "PannamOS server runtime path was not created: $pannamosRuntimeDir"
  }

  if (Test-Path $browserOsRuntimeDir) {
    Fail "PannamOS profile contains BrowserOS runtime path: $browserOsRuntimeDir"
  } else {
    Pass "PannamOS profile does not contain .browseros runtime data"
  }

  if (Test-Path $pannamosVersionsDir) {
    Fail "PannamOS sidecar updater versions path exists by default: $pannamosVersionsDir"
  } else {
    Pass "PannamOS sidecar updater versions path was not created by default"
  }

  if (Test-Path $pannamosPendingUpdateDir) {
    Fail "PannamOS sidecar updater pending path exists by default: $pannamosPendingUpdateDir"
  } else {
    Pass "PannamOS sidecar updater pending path was not created by default"
  }

  $profileExtensionsDir = Join-Path $profileDir "Default\Extensions"
  if ($pannamosAgentExtensionId) {
    $profileAgentDir = Join-Path $profileExtensionsDir $pannamosAgentExtensionId
    if (Test-Path $profileAgentDir) {
      Pass "PannamOS private agent extension is installed in the local profile"
    } else {
      Fail "PannamOS private agent extension is not installed in the local profile: $profileAgentDir"
    }
  }

  foreach ($upstreamId in $upstreamBrowserOSExtensionIds) {
    $upstreamProfileDir = Join-Path $profileExtensionsDir $upstreamId
    if (Test-Path $upstreamProfileDir) {
      Fail "PannamOS profile contains upstream BrowserOS extension: $upstreamProfileDir"
    }
  }

  $profilePreferencesPath = Join-Path $profileDir "Default\Preferences"
  if (Test-Path $profilePreferencesPath) {
    $preferences = Get-Content -Raw -Path $profilePreferencesPath
    if ($preferences -match "cdn\.browseros\.com/extensions") {
      Fail "PannamOS profile contains BrowserOS extension CDN defaults"
    } else {
      Pass "PannamOS profile does not contain BrowserOS extension CDN defaults"
    }
  }
}

if ($missing.Count -gt 0) {
  Write-Output ""
  Write-Output "PannamOS side-by-side install validation failed with $($missing.Count) missing item(s)."
  exit 1
}

Write-Output ""
Write-Output "PannamOS side-by-side install validation passed."
if ($warnings.Count -gt 0) {
  Write-Output "Warnings: $($warnings.Count)"
}
