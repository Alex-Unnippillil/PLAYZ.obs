# SPDX-License-Identifier: GPL-2.0-or-later
# Developer/CI-only UI Automation. Use Windows PowerShell 5.1 -STA.
param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$EvidenceDirectory, [Parameter(Mandatory)][string]$MediaFile)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$executablePath = (Resolve-Path $Executable).Path
$mediaPath = (Resolve-Path $MediaFile).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$script:appProcess = $null
$script:window = $null
$script:picker = $null
function Named-Condition([string]$Name) {
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
}
function Find-Control([string]$Name) {
  $script:window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (Named-Condition $Name))
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
function Invoke-Element($Control) {
  if ($null -eq $Control) { throw 'Cannot invoke a missing automation element' }
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while (-not $Control.Current.IsEnabled) {
    if ([DateTime]::UtcNow -ge $deadline) { throw "Control did not become enabled: $($Control.Current.Name)" }
    Start-Sleep -Milliseconds 200
  }
  $pattern = $Control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
}
function Invoke-Control([string]$Name) { Invoke-Element (Wait-Control $Name) }
function Open-App {
  $script:appProcess = Start-Process -FilePath $executablePath -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $script:appProcess.Refresh()
    if ($script:appProcess.HasExited) { throw "Installed executable exited with $($script:appProcess.ExitCode)" }
    if ($script:appProcess.MainWindowHandle -ne [IntPtr]::Zero) {
      $script:window = [System.Windows.Automation.AutomationElement]::FromHandle($script:appProcess.MainWindowHandle)
      # InvokePattern does not require focus on the non-focusable window container.
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
function Save-Controls($Root, [string]$Name) {
  $controls = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  @($controls | Select-Object -First 300 | ForEach-Object { [ordered]@{ name = $_.Current.Name; automation_id = $_.Current.AutomationId; control = $_.Current.ControlType.ProgrammaticName; enabled = $_.Current.IsEnabled } }) | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $EvidenceDirectory "$Name.json")
}
function Import-Fixture {
  Write-Output 'Installed UI: opening native import picker'
  Invoke-Control 'Import video'
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $script:picker = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, (Named-Condition 'Import local H.264 / AAC media'))
    if ($null -ne $script:picker) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($null -eq $script:picker) { throw 'Native import file picker did not open' }
  # A native dialog can exist before its child provider is ready. The filename
  # is a ComboBox on some Windows builds and its Edit child on others.
  $value = $null
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $controls = $script:picker.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($control in $controls) {
      $type = $control.Current.ControlType
      $name = $control.Current.Name.Trim().TrimEnd(':')
      $id = $control.Current.AutomationId
      if (($type -eq [System.Windows.Automation.ControlType]::Edit -or $type -eq [System.Windows.Automation.ControlType]::ComboBox) -and ($name -eq 'File name' -or $id -eq '1148' -or $id -eq '1001')) {
        $candidate = $null
        if ($control.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$candidate)) {
          $typed = [System.Windows.Automation.ValuePattern]$candidate
          if (-not $typed.Current.IsReadOnly -and $control.Current.IsEnabled) { $value = $typed; break }
        }
      }
    }
    if ($null -ne $value) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  Save-Controls $script:picker 'native-picker-controls'
  if ($null -eq $value) { throw 'Native file picker did not expose a writable filename control' }
  $value.SetValue($mediaPath)
  $open = $script:picker.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (Named-Condition 'Open'))
  Invoke-Element $open
  $script:picker = $null
  Wait-Control 'Make a clip' | Out-Null
  Write-Output 'Installed UI: local media imported through the native picker'
}
function Verify-Playback {
  Invoke-Control 'Preview interval'
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $items = $script:window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($item in $items) {
      $name = $item.Current.Name
      if ($name -match '^00:0[1-9]\s*/\s*00:0[1-9]$') { Save-Window 'playing-import'; Write-Output "Installed UI: real video playhead advanced to $name"; return }
    }
    Start-Sleep -Milliseconds 150
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'The packaged HTML video playhead did not advance on the real MP4 playback asset'
}
try {
  Open-App
  Save-Window 'library'
  Invoke-Control 'Capture settings'
  Wait-Control 'Video source' | Out-Null
  Wait-Control 'Recording folder' | Out-Null
  Save-Window 'capture-settings'
  Invoke-Control 'Diagnostics'
  Wait-Control 'Consistent library backup' | Out-Null
  Save-Window 'diagnostics'
  Write-Output 'Installed UI: library, native settings and diagnostics rendered'
  Invoke-Control 'Library'
  Import-Fixture
  Verify-Playback
  Invoke-Control 'Queue export'
  Wait-Control 'Show clip' | Out-Null
  Save-Window 'completed-ui-export'
  Write-Output 'Installed UI: real export completed'
  $second = Start-Process -FilePath $executablePath -PassThru
  try { if (-not $second.WaitForExit(15000)) { throw 'Second launch did not hand off to the existing instance' } } finally { $second.Dispose() }
  if (@(Get-Process -Name PLAYZ -ErrorAction SilentlyContinue).Count -ne 1) { throw 'Expected exactly one PLAYZ instance' }
  Invoke-Control 'Quit safely'
  if (-not $script:appProcess.WaitForExit(20000)) { throw 'Safe quit did not finish' }
  $script:appProcess.Dispose(); $script:appProcess = $null
  Open-App
  Wait-Control ('Open ' + [IO.Path]::GetFileNameWithoutExtension($mediaPath)) | Out-Null
  Save-Window 'persisted-library'
  Invoke-Control 'Quit safely'
  if (-not $script:appProcess.WaitForExit(20000)) { throw 'Restarted application did not quit' }
  [ordered]@{ schema_version = 1; installed_launch = $true; native_state_settings = $true; diagnostics_view = $true; native_picker_import = $true; packaged_video_playhead_advanced = $true; native_ui_export_completed = $true; single_instance = $true; persisted_library_after_restart = $true; classification = 'Hosted packaged workflow, not clean Windows 11 offline or game acceptance' } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $EvidenceDirectory 'installed-smoke.json')
} catch {
  if ($null -ne $script:window) {
    try {
      Save-Window 'failure'
      Save-Controls $script:window 'failure-controls'
      if ($null -ne $script:picker) { Save-Controls $script:picker 'failure-picker-controls' }
    } catch { Write-Warning 'Could not collect all failure diagnostics' }
  }
  throw
} finally {
  if ($null -ne $script:appProcess) {
    if (-not $script:appProcess.HasExited) { Stop-Process -Id $script:appProcess.Id -Force }
    $script:appProcess.Dispose()
  }
}
