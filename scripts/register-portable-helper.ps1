param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot
)

$ErrorActionPreference = "Stop"

$InstallRoot = (Resolve-Path $InstallRoot).Path
$NodeExe = Join-Path $InstallRoot "node\node.exe"
$HelperServer = Join-Path $InstallRoot "scripts\gst-collector-server.mjs"
$ProtocolLauncher = Join-Path $InstallRoot "scripts\workline-gst-protocol-launch.mjs"
$HelperPort = if ($env:WORKLINE_GST_HELPER_PORT) { $env:WORKLINE_GST_HELPER_PORT } else { "48782" }

if (-not (Test-Path $NodeExe)) {
  throw "Portable Node was not found at $NodeExe"
}

if (-not (Test-Path $HelperServer)) {
  throw "GST helper server script was not found at $HelperServer"
}

$env:WORKLINE_GST_HOME = $InstallRoot

function Register-Protocol([string]$Name, [string]$Title, [string]$Command) {
  $protocolKey = "HKCU:\Software\Classes\$Name"
  New-Item -Path $protocolKey -Force | Out-Null
  New-ItemProperty -Path $protocolKey -Name "(Default)" -Value $Title -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
  New-ItemProperty -Path "$protocolKey\shell\open\command" -Name "(Default)" -Value $Command -PropertyType String -Force | Out-Null
}

$protocolCommand = "`"$NodeExe`" `"$ProtocolLauncher`" `"%1`""
Register-Protocol -Name "workline-gst" -Title "URL:WorkLine GST Protocol" -Command $protocolCommand

$taskName = "WorkLine GST Helper"
$taskAction = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$HelperServer`"" -WorkingDirectory $InstallRoot
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Force | Out-Null

$existingHelper = $null
try {
  $existingHelper = Invoke-WebRequest -Uri "http://127.0.0.1:$HelperPort/health" -UseBasicParsing -TimeoutSec 2
} catch {
  $existingHelper = $null
}

if (-not $existingHelper) {
  Start-Process -FilePath $NodeExe -ArgumentList "`"$HelperServer`"" -WorkingDirectory $InstallRoot -WindowStyle Hidden
}

Write-Host "WorkLine GST helper is ready at $InstallRoot"
