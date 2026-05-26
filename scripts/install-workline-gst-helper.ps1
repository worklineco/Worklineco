#Requires -Version 5.1
<#
.SYNOPSIS
  One-time WorkLine GST helper setup for Windows.

.DESCRIPTION
  Installs the local helper to %LOCALAPPDATA%\WorkLine\GSTHelper,
  registers the workline-gst:// protocol, and starts the helper at sign-in.
  Node.js is installed via winget when missing (one UAC prompt may appear).

.PARAMETER SourcePath
  Folder that contains package.json and the scripts\ directory.
  When omitted, the installer downloads the helper bundle from BundleUrl.

.PARAMETER BundleUrl
  Zip file that contains package.json and scripts\ for the local helper.
#>
param(
  [string]$SourcePath = "",
  [string]$BundleUrl = "https://worklineco.com/gst-helper-bundle.zip"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

$InstallRoot = Join-Path $env:LOCALAPPDATA "WorkLine\GSTHelper"
$ProtocolName = "workline-gst"
$InstallProtocolName = "workline-gst-install"
$HelperPort = if ($env:WORKLINE_GST_HELPER_PORT) { $env:WORKLINE_GST_HELPER_PORT } else { "48782" }

function Get-SiteOriginFromBundleUrl([string]$Url) {
  if ($Url -match "^(https?://[^/]+)") {
    return $matches[1]
  }

  return "https://worklineco.com"
}

$SiteOrigin = Get-SiteOriginFromBundleUrl -Url $BundleUrl

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

if (-not $SourcePath) {
  Write-Step "Downloading helper bundle"
  $bundleArchive = Join-Path $env:TEMP "workline-gst-helper-bundle.zip"
  $bundleFolder = Join-Path $env:TEMP "workline-gst-helper-bundle"
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
  "scripts\gst-collector-server.mjs",
  "scripts\gst-portal-collector.mjs",
  "scripts\gst-helper-home.mjs",
  "scripts\workline-gst-protocol-launch.mjs",
  "scripts\WorkLineGSTHelperSetup.vbs"
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

  Write-Step "Node.js not found. Installing Node.js LTS with winget (approve the prompt if Windows asks)"
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js is still unavailable. Install Node.js LTS manually, then run this installer again."
  }

  return $node.Source
}

$nodeExe = Ensure-Node

Write-Step "Installing helper dependencies"
Push-Location $InstallRoot
& npm ci --omit=dev
if ($LASTEXITCODE -ne 0) {
  & npm install --omit=dev
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "npm install failed in $InstallRoot"
  }
}
Pop-Location

$protocolLauncher = Join-Path $InstallRoot "scripts\workline-gst-protocol-launch.mjs"
$helperServer = Join-Path $InstallRoot "scripts\gst-collector-server.mjs"
$protocolCommand = "`"$nodeExe`" `"$protocolLauncher`" `"%1`""
$helperCommand = "`"$nodeExe`" `"$helperServer`""

Write-Step "Registering $ProtocolName:// link"
$protocolKey = "HKCU:\Software\Classes\$ProtocolName"
New-Item -Path $protocolKey -Force | Out-Null
New-ItemProperty -Path $protocolKey -Name "(Default)" -Value "URL:WorkLine GST Protocol" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
New-ItemProperty -Path "$protocolKey\shell\open\command" -Name "(Default)" -Value $protocolCommand -PropertyType String -Force | Out-Null

$installLauncher = Join-Path $InstallRoot "WorkLineGSTHelperSetup.vbs"
$launcherTemplatePath = Join-Path $SourcePath "scripts\WorkLineGSTHelperSetup.vbs"
if (Test-Path $launcherTemplatePath) {
  $launcherTemplate = Get-Content -Path $launcherTemplatePath -Raw
  $launcherTemplate.Replace("{{ORIGIN}}", $SiteOrigin) | Set-Content -Path $installLauncher -Encoding ASCII
}

if (Test-Path $installLauncher) {
  Write-Step "Registering $InstallProtocolName:// link for one-click reinstall"
  $installProtocolKey = "HKCU:\Software\Classes\$InstallProtocolName"
  $installProtocolCommand = "wscript.exe `"$installLauncher`" `"%1`""
  New-Item -Path $installProtocolKey -Force | Out-Null
  New-ItemProperty -Path $installProtocolKey -Name "(Default)" -Value "URL:WorkLine GST Install" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $installProtocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  New-Item -Path "$installProtocolKey\shell\open\command" -Force | Out-Null
  New-ItemProperty -Path "$installProtocolKey\shell\open\command" -Name "(Default)" -Value $installProtocolCommand -PropertyType String -Force | Out-Null
}

Write-Step "Starting helper in the background"
$existingHelper = $null
try {
  $existingHelper = Invoke-WebRequest -Uri "http://127.0.0.1:$HelperPort/health" -UseBasicParsing -TimeoutSec 2
} catch {
  $existingHelper = $null
}

if (-not $existingHelper) {
  Start-Process -FilePath $nodeExe -ArgumentList "`"$helperServer`"" -WorkingDirectory $InstallRoot -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Step "Adding sign-in startup task"
$taskName = "WorkLine GST Helper"
$taskAction = New-ScheduledTaskAction -Execute $nodeExe -Argument "`"$helperServer`"" -WorkingDirectory $InstallRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Force | Out-Null

$excelPath = Join-Path $env:USERPROFILE "Downloads\WorkLineCo.xlsx"
if (-not (Test-Path $excelPath)) {
  Write-Host ""
  Write-Host "Note: create $excelPath with GSTIN (A), portal user ID (B), and password (C)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "WorkLine GST helper is installed." -ForegroundColor Green
Write-Host "Open worklineco.com/gst and click Get data. The helper should start automatically on this PC."
Write-Host "Install folder: $InstallRoot"
