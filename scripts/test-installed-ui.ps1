# SPDX-License-Identifier: GPL-2.0-or-later
# Developer/CI-only UI Automation smoke test. Run with Windows PowerShell 5.1 -STA.
param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$executablePath = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$script:appProcess = $null
$script:window = $null
function Find-Control([string]$Name) {
  $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
  $script:window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
}
function Wait-Control([string]$Name) {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $control = Find-Control $Name
    if ($null -ne $control) { return $control }
    if ($script:appProcess.HasExited) { throw 'Installed application exited unexpectedly' }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Installed UI did not expose expected control: $Name"
}
function Invoke-Control([string]$Name) {
  $control = Wait-Control $Name
  $pattern = $control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
}
function Open-App {
  $script:appProcess = Start-Process -FilePath $executablePath -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $script:appProcess.Refresh()
    if ($script:appProcess.HasExited) { throw "Installed executable exited with $($script:appProcess.ExitCode)" }
    if ($script:appProcess.MainWindowHandle -ne [IntPtr]::Zero) {
      $script:window = [System.Windows.Automation.AutomationElement]::FromHandle($script:appProcess.MainWindowHandle)
      $script:window.SetFocus()
      Wait-Control 'Your recordings' | Out-Null
      return
    }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Installed application did not create its main window'
}
function Save-Window([string]$Name) {
  $rect = $script:window.Current.BoundingRectangle
  $image = [System.Drawing.Bitmap]::new([int]$rect.Width, [int]$rect.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  try {
    $graphics.CopyFromScreen([int]$rect.X, [int]$rect.Y, 0, 0, $image.Size)
    $image.Save((Join-Path $EvidenceDirectory "$Name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $image.Dispose() }
}
try {
  Open-App
  Save-Window 'library'
  Invoke-Control 'Capture settings'
  # This section is rendered only after a real app_state command has returned.
  Wait-Control 'Video source' | Out-Null
  Wait-Control 'Recording folder' | Out-Null
  Save-Window 'capture-settings'
  Invoke-Control 'Diagnostics'
  Wait-Control 'Consistent library backup' | Out-Null
  Save-Window 'diagnostics'
  $second = Start-Process -FilePath $executablePath -PassThru
  try { if (-not $second.WaitForExit(15000)) { throw 'Second launch did not hand off to the existing instance' } } finally { $second.Dispose() }
  if (@(Get-Process -Name PLAYZ -ErrorAction SilentlyContinue).Count -ne 1) { throw 'Expected exactly one PLAYZ instance' }
  Invoke-Control 'Quit safely'
  if (-not $script:appProcess.WaitForExit(20000)) { throw 'Safe quit did not finish' }
  $script:appProcess.Dispose(); $script:appProcess = $null
  Open-App
  Invoke-Control 'Quit safely'
  if (-not $script:appProcess.WaitForExit(20000)) { throw 'Restarted application did not quit' }
  [ordered]@{ schema_version = 1; installed_launch = $true; native_state_settings = $true; diagnostics_view = $true; single_instance = $true; safe_idle_quit_restart = $true; classification = 'Hosted packaged smoke test, not clean Windows 11 offline or game acceptance' } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $EvidenceDirectory 'installed-smoke.json')
} finally {
  if ($null -ne $script:appProcess) {
    if (-not $script:appProcess.HasExited) { Stop-Process -Id $script:appProcess.Id -Force }
    $script:appProcess.Dispose()
  }
}
