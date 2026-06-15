#Requires -Version 5.1
<#
.SYNOPSIS
  One-time WorkLine DSC helper setup for Windows.

.DESCRIPTION
  Installs the local DSC helper to %LOCALAPPDATA%\WorkLine\DSCHelper,
  starts it in the background, and adds a startup task so WorkLine can
  detect it automatically from PDF & Indexing.
#>
param(
  [string]$SourcePath = "",
  [string]$BundleUrl = "https://worklineco.com/dsc-helper-bundle-v9.zip"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$InstallRoot = Join-Path $env:LOCALAPPDATA "WorkLine\DSCHelper"
$HelperPort = if ($env:WORKLINE_DSC_HELPER_PORT) { $env:WORKLINE_DSC_HELPER_PORT } else { "48783" }

function Stop-ExistingHelper {
  Write-Step "Stopping existing WorkLine DSC helper on port $HelperPort"

  try {
    $connections = Get-NetTCPConnection -LocalPort ([int]$HelperPort) -State Listen -ErrorAction SilentlyContinue
  } catch {
    $connections = @()
  }

  foreach ($connection in $connections) {
    if (-not $connection.OwningProcess) {
      continue
    }

    try {
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
      Start-Sleep -Seconds 1
    } catch {
      Write-Warning "Could not stop existing helper process $($connection.OwningProcess): $($_.Exception.Message)"
    }
  }
}

function Resolve-SourcePath {
  param([string]$RequestedSourcePath)

  if ($RequestedSourcePath) {
    return (Resolve-Path $RequestedSourcePath).Path
  }

  $candidateRoots = @(
    (Split-Path -Parent $PSScriptRoot),
    $PSScriptRoot
  )

  foreach ($candidate in $candidateRoots) {
    if (Test-Path (Join-Path $candidate "package.json")) {
      return (Resolve-Path $candidate).Path
    }
  }

  return ""
}

$SourcePath = Resolve-SourcePath -RequestedSourcePath $SourcePath

Stop-ExistingHelper

if (-not $SourcePath) {
  Write-Step "Downloading DSC helper bundle"
  $bundleArchive = Join-Path $env:TEMP "workline-dsc-helper-bundle.zip"
  $bundleFolder = Join-Path $env:TEMP "workline-dsc-helper-bundle"
  Invoke-WebRequest -Uri $BundleUrl -OutFile $bundleArchive
  if (Test-Path $bundleFolder) {
    Remove-Item -Recurse -Force $bundleFolder
  }
  Expand-Archive -Path $bundleArchive -DestinationPath $bundleFolder -Force
  $SourcePath = $bundleFolder
}

Write-Step "Preparing install folder at $InstallRoot"
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

$filesToCopy = @(
  "package.json",
  "package-lock.json",
  "scripts\dsc-signing-server.mjs"
)

foreach ($relativePath in $filesToCopy) {
  $sourceFile = Join-Path $SourcePath $relativePath
  if (-not (Test-Path $sourceFile)) {
    throw "Missing required file: $sourceFile"
  }

  $targetFile = Join-Path $InstallRoot $relativePath
  $targetDirectory = Split-Path -Parent $targetFile
  New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
  Copy-Item -Path $sourceFile -Destination $targetFile -Force
}

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    return $node.Source
  }

  Write-Step "Node.js not found. Installing Node.js LTS with winget"
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js is still unavailable. Install Node.js LTS manually, then run this installer again."
  }

  return $node.Source
}

$nodeExe = Ensure-Node
$helperServer = Join-Path $InstallRoot "scripts\dsc-signing-server.mjs"

Write-Step "Starting DSC helper in the background"
Start-Process -FilePath $nodeExe -ArgumentList "`"$helperServer`"" -WorkingDirectory $InstallRoot -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Step "Adding sign-in startup task"
$taskName = "WorkLine DSC Helper"
$taskAction = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$helperServer`"" -WorkingDirectory $InstallRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
try {
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Force | Out-Null
} catch {
  Write-Warning "Could not register startup task: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "WorkLine DSC helper is installed." -ForegroundColor Green
Write-Host "Return to WorkLine PDF & Indexing and click Check."
Write-Host "Install folder: $InstallRoot"
