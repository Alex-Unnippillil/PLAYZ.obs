# SPDX-License-Identifier: GPL-2.0-or-later
# Developer-only .NET Framework UIA host. Register Microsoft's standard legacy
# control providers before enumerating native file-picker controls. Without the
# providers this PowerShell host exposes Win32 buttons/edits as generic Panes.
# https://learn.microsoft.com/dotnet/api/system.windows.automation.clientsettings.registerclientsideproviderassembly
param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$EvidenceDirectory, [Parameter(Mandatory)][string]$MediaFile)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationClientsideProviders
$provider = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq 'UIAutomationClientsideProviders' } | Select-Object -First 1
if ($null -eq $provider) { throw 'Microsoft standard UI Automation providers could not be loaded' }
[System.Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly($provider.GetName())
Write-Output "Registered standard Windows UI Automation providers: $($provider.FullName)"
& "$PSScriptRoot/test-installed-ui.ps1" -Executable $Executable -EvidenceDirectory $EvidenceDirectory -MediaFile $MediaFile
