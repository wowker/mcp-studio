# Run from an extracted candidate; never execute from the installed prefix.
param(
 [Parameter(Mandatory=$true)][ValidateSet('install','upgrade','uninstall')][string]$Action,
 [Parameter(Mandatory=$true)][string]$Prefix,
 [Parameter(Mandatory=$true)][string]$StateDirectory
)
$ErrorActionPreference = 'Stop'
$Candidate = Join-Path $PSScriptRoot 'mcp-studio-agent.exe'
& $Candidate "--$Action-prefix" $Prefix '--state-dir' $StateDirectory
if ($LASTEXITCODE -ne 0) { throw 'Agent managed lifecycle operation failed. See safe error code above.' }
