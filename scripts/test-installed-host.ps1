# SPDX-License-Identifier: GPL-2.0-or-later
# Developer-only test driver. No helper, automation server or override ships.
# Chromium UI uses UI Automation; the standard Win32 file picker is exercised
# with bounded documented messages, scoped to the expected application process.
param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$EvidenceDirectory, [Parameter(Mandatory)][string]$MediaFile)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PlayzPickerTest {
  private delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr param);
  [DllImport("user32.dll")] private static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint process);
  [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, string text, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", SetLastError=true)] private static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  private static string ClassName(IntPtr hwnd) {
    var text = new StringBuilder(256); GetClassName(hwnd, text, text.Capacity); return text.ToString();
  }
  public static bool FillAndAccept(IntPtr dialog, string file, uint expectedProcess) {
    uint process; GetWindowThreadProcessId(dialog, out process);
    if (process != expectedProcess) throw new InvalidOperationException("The file picker is not owned by the tested PLAYZ process");
    IntPtr combo=IntPtr.Zero, button=IntPtr.Zero;
    EnumChildWindows(dialog, delegate(IntPtr hwnd, IntPtr unused) {
      int id=GetDlgCtrlID(hwnd); string name=ClassName(hwnd);
      if (id==1148 && name.StartsWith("ComboBox", StringComparison.OrdinalIgnoreCase)) combo=hwnd;
      if (id==1 && name.Equals("Button", StringComparison.OrdinalIgnoreCase)) button=hwnd;
      return true;
    }, IntPtr.Zero);
    if (combo==IntPtr.Zero || button==IntPtr.Zero || !IsWindowEnabled(button)) return false;
    IntPtr edit=IntPtr.Zero;
    EnumChildWindows(combo, delegate(IntPtr hwnd, IntPtr unused) {
      if (ClassName(hwnd).Equals("Edit", StringComparison.OrdinalIgnoreCase)) { edit=hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    if (edit==IntPtr.Zero) return false;
    SetForegroundWindow(dialog);
    IntPtr result;
    // WM_SETTEXT: invoke the actual native picker input, not a Tauri command.
    if (SendMessageTimeout(edit, 0x000C, IntPtr.Zero, file, 2, 5000, out result)==IntPtr.Zero || result==IntPtr.Zero)
      throw new InvalidOperationException("The native picker rejected its bounded filename update");
    // BM_CLICK follows the same native Open button validation as a user click.
    if (!PostMessage(button, 0x00F5, IntPtr.Zero, IntPtr.Zero))
      throw new InvalidOperationException("The native Open button could not be invoked");
    return true;
  }
}
'@
& "$PSScriptRoot/test-installed-ui.ps1" -Executable $Executable -EvidenceDirectory $EvidenceDirectory -MediaFile $MediaFile
