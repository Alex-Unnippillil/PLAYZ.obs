# SPDX-License-Identifier: GPL-2.0-or-later
# Dot-sourced by test-installed-ui.ps1. Uses its real, process-scoped UIA helpers.
function Save-WorkspaceView {
  Invoke-Control 'Library'
  Invoke-Control 'How this estimate works'
  Save-Window 'workspace-storage-budget'
  Invoke-Control 'How this estimate works'
  Invoke-Control 'Save current library view'
  $inputControl = Wait-Control 'View name'
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
