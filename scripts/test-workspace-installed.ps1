# SPDX-License-Identifier: GPL-2.0-or-later
# Dot-sourced by test-installed-ui.ps1. Uses its real, process-scoped UIA helpers.
function Save-WorkspaceView {
  Invoke-Control 'Library'
  Invoke-Control 'How this estimate works'
  Save-Window 'workspace-storage-budget'
  Invoke-Control 'How this estimate works'
  Invoke-Control 'Save current library view'
  # The label text and edit can share a name; require the actual editable control.
  $condition = [System.Windows.Automation.AndCondition]::new(
    (Named-Condition 'View name'),
    [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit))
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $inputControl = $script:window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
    if ($null -ne $inputControl) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  if ($null -eq $inputControl) { throw 'Saved-view dialog did not expose its name edit' }
  $value = [System.Windows.Automation.ValuePattern]$inputControl.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $value.SetValue('Local review')
  Invoke-Control 'Save view'
  Wait-Control 'Apply saved view: Local review' | Out-Null
  Invoke-Control 'Compact recording density'
  Save-Window 'workspace-saved-view'
}
function Assert-WorkspaceView {
  Wait-Control 'Apply saved view: Local review' | Out-Null
  $density = Wait-Control 'Compact recording density'
  $toggle = [System.Windows.Automation.TogglePattern]$density.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  if ($toggle.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On) {
    throw 'Installed library density did not persist after restart'
  }
  Invoke-Control 'Apply saved view: Local review'
  Wait-Control 'Open fixture' | Out-Null
  Save-Window 'workspace-preferences-after-restart'
  Invoke-Control 'Comfortable recording density'
  Write-Output 'Installed UI: saved view and density survived a real application restart; applying the view retained native catalog access'
}
