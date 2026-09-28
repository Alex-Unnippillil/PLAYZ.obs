# SPDX-License-Identifier: GPL-2.0-or-later
# Real installed WebView2 controls only; no JavaScript or mock backend injection.
function Review-NumberPattern([string]$Name) {
  $items = $script:window.FindAll([System.Windows.Automation.TreeScope]::Descendants, (Named-Condition $Name))
  foreach ($item in $items) {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      return @{ Kind = 'Value'; Pattern = $pattern }
    }
    if ($item.TryGetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern, [ref]$pattern)) {
      return @{ Kind = 'Range'; Pattern = $pattern }
    }
  }
  throw "No numeric UIA pattern exposed for $Name"
}
function Read-ReviewNumber([string]$Name) {
  $entry = Review-NumberPattern $Name
  return [double]::Parse([string]$entry.Pattern.Current.Value, [Globalization.CultureInfo]::InvariantCulture)
}
function Assert-ReviewNumber([string]$Name, [double]$Expected) {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    if ([Math]::Abs((Read-ReviewNumber $Name) - $Expected) -lt 0.002) { return }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "$Name did not become $Expected"
}
function Review-TogglePattern([string]$Name) {
  $items = $script:window.FindAll([System.Windows.Automation.TreeScope]::Descendants, (Named-Condition $Name))
  foreach ($item in $items) {
    $pattern = $null
    if ($item.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pattern)) {
      if (-not $item.Current.IsEnabled) { throw "$Name is unexpectedly disabled" }
      return [System.Windows.Automation.TogglePattern]$pattern
    }
  }
  throw "No toggle UIA pattern exposed for $Name"
}
function Assert-ReviewToggle([string]$Name, [string]$Expected) {
  # A successful UIA Toggle call is not proof that the renderer/accessibility
  # tree has committed the change. Reacquire and observe; never toggle again
  # while waiting, since a second action could undo the intended opt-in.
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  $observed = 'Unavailable'
  do {
    $pattern = Review-TogglePattern $Name
    $observed = [string]$pattern.Current.ToggleState
    if ($observed -eq $Expected) { return }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  Save-Window 'review-toggle-failure'
  throw "$Name did not become $Expected; last observed state: $observed"
}
function Test-ReviewStudio {
  if ($null -ne (Find-Control 'Stop preview')) { Invoke-Control 'Stop preview' }
  Wait-Control 'Selection start' | Out-Null
  Wait-Control 'Selection end' | Out-Null
  $total = Read-ReviewNumber 'Trim out seconds'
  if ($total -lt 3) { throw 'Review fixture is too short for the selection test' }
  $entry = Review-NumberPattern 'Trim out seconds'
  if ($entry.Kind -eq 'Value') { $entry.Pattern.SetValue('2') } else { $entry.Pattern.SetValue([double]2) }
  Assert-ReviewNumber 'Trim out seconds' 2
  Invoke-Control 'Undo selection'
  Assert-ReviewNumber 'Trim out seconds' $total
  Invoke-Control 'Redo selection'
  Assert-ReviewNumber 'Trim out seconds' 2
  Assert-ReviewToggle 'Loop selection' 'Off'
  (Review-TogglePattern 'Loop selection').Toggle()
  Assert-ReviewToggle 'Loop selection' 'On'
  if ($null -ne (Find-Control 'Stop preview')) { throw 'Choosing Loop must not start preview automatically' }
  Invoke-Control 'Preview interval'
  $seenOne = $false; $looped = $false
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $position = Playback-Seconds
    if ($position -ge 1) { $seenOne = $true }
    if ($seenOne -and $position -eq 0) { $looped = $true; break }
    Start-Sleep -Milliseconds 120
  } while ([DateTime]::UtcNow -lt $deadline)
  if (-not $looped) { throw 'Installed selected-interval playback did not wrap back to trim-in' }
  Invoke-Control 'Stop preview'
  Save-Window 'review-studio-installed'
  (Review-TogglePattern 'Loop selection').Toggle()
  Assert-ReviewToggle 'Loop selection' 'Off'
  Invoke-Control 'Full recording'
  Assert-ReviewNumber 'Trim out seconds' $total
  Write-Output 'Installed review studio: two slider controls, numeric edit, undo/redo, explicit loop boundary and stop preview passed on actual media'
}
