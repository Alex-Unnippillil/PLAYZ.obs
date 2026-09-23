# SPDX-License-Identifier: GPL-2.0-or-later
param([Parameter(Mandatory)][string]$Title, [string]$AudioFile = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# Use the platform's loaded WinForms types directly. No dynamically compiled
# C# dependency set or additional test package is required.
$form = [System.Windows.Forms.Form]::new()
$form.Text = $Title
$form.ClientSize = [System.Drawing.Size]::new(800, 450)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$property = [System.Windows.Forms.Form].GetProperty('DoubleBuffered', [Reflection.BindingFlags]'Instance,NonPublic')
$property.SetValue($form, $true)
$font = [System.Drawing.Font]::new('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
$clock = [Diagnostics.Stopwatch]::StartNew()
$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = 33
$timer.Add_Tick({ $form.Invalidate() })
$form.Add_Paint({
  param($sender, $event)
  $ms = $clock.ElapsedMilliseconds
  $event.Graphics.Clear([System.Drawing.Color]::FromArgb(16, 21, 31))
  $color = if ($ms % 1000 -lt 500) { [System.Drawing.Color]::Crimson } else { [System.Drawing.Color]::RoyalBlue }
  $first = [System.Drawing.SolidBrush]::new($color)
  $second = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::MediumAquamarine)
  try {
    $event.Graphics.FillRectangle($first, 20, 120, 360, 240)
    $event.Graphics.FillRectangle($second, 400, 120, 380, 240)
    $event.Graphics.DrawString('PLAYZ - SELECTED WINDOW FIXTURE', $font, [System.Drawing.Brushes]::White, [single]20, [single]22)
    $event.Graphics.DrawString("Elapsed $ms ms", $font, [System.Drawing.Brushes]::White, [single]20, [single]65)
    $event.Graphics.FillRectangle([System.Drawing.Brushes]::White, [int]($ms / 5 % 740) + 20, 385, 35, 35)
  } finally { $first.Dispose(); $second.Dispose() }
})
$form.Add_Shown({
  $timer.Start()
  [Console]::WriteLine('PLAYZ_FIXTURE_READY')
  [Console]::Out.Flush()
})
$player = $null
try {
  if ($AudioFile) {
    $player = [System.Media.SoundPlayer]::new($AudioFile)
    $player.Load()
    $player.PlayLooping()
  }
  [System.Windows.Forms.Application]::Run($form)
} finally {
  $timer.Dispose()
  $font.Dispose()
  $form.Dispose()
  if ($player) { $player.Stop(); $player.Dispose() }
}
