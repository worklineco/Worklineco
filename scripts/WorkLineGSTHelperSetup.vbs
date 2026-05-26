Option Explicit
' One-time WorkLine GST helper installer. Opens elevated hidden PowerShell (UAC prompt only).
Const SITE_ORIGIN = "{{ORIGIN}}"

Dim shell
Set shell = CreateObject("Shell.Application")

Dim psArgs
psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command " & _
  "& {$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " & _
  "$installer = Join-Path $env:TEMP 'workline-gst-install.ps1'; " & _
  "Invoke-WebRequest -Uri '" & SITE_ORIGIN & "/api/gst/helper/install' -OutFile $installer; " & _
  "& powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $installer -BundleUrl '" & SITE_ORIGIN & "/gst-helper-bundle.zip'}"

shell.ShellExecute "powershell.exe", psArgs, "", "runas", 0
