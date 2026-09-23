# SPDX-License-Identifier: GPL-2.0-or-later
param([Parameter(Mandatory)][string]$Title, [string]$AudioFile = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Windows.Forms;
public sealed class PlayzFixture : Form {
  private readonly System.Diagnostics.Stopwatch clock = System.Diagnostics.Stopwatch.StartNew();
  private readonly Timer timer = new Timer();
  private readonly Font label = new Font("Segoe UI", 20, FontStyle.Bold);
  public PlayzFixture(string title) {
    Text = title;
    ClientSize = new Size(800, 450);
    StartPosition = FormStartPosition.CenterScreen;
    DoubleBuffered = true;
    timer.Interval = 33;
    timer.Tick += (sender, args) => Invalidate();
    Shown += (sender, args) => { timer.Start(); Console.WriteLine("PLAYZ_FIXTURE_READY"); Console.Out.Flush(); };
  }
  protected override void OnPaint(PaintEventArgs e) {
    base.OnPaint(e);
    long ms = clock.ElapsedMilliseconds;
    e.Graphics.Clear(Color.FromArgb(16,21,31));
    using (var first = new SolidBrush(ms % 1000 < 500 ? Color.Crimson : Color.RoyalBlue))
      e.Graphics.FillRectangle(first, 20, 120, 360, 240);
    using (var second = new SolidBrush(Color.MediumAquamarine))
      e.Graphics.FillRectangle(second, 400, 120, 380, 240);
    e.Graphics.DrawString("PLAYZ — SELECTED WINDOW FIXTURE", label, Brushes.White, 20, 22);
    e.Graphics.DrawString("Elapsed " + ms.ToString() + " ms", label, Brushes.White, 20, 65);
    e.Graphics.FillRectangle(Brushes.White, (int)(ms / 5 % 740) + 20, 385, 35, 35);
  }
  protected override void Dispose(bool disposing) {
    if (disposing) { timer.Dispose(); label.Dispose(); }
    base.Dispose(disposing);
  }
}
'@ -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Drawing.Common
$player = $null
try {
  if ($AudioFile) {
    $player = [System.Media.SoundPlayer]::new($AudioFile)
    $player.Load()
    $player.PlayLooping()
  }
  [System.Windows.Forms.Application]::Run([PlayzFixture]::new($Title))
} finally {
  if ($player) { $player.Stop(); $player.Dispose() }
}
