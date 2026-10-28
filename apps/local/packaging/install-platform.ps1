# Run from the extracted candidate directory, NOT from the installed prefix.
param(
  [Parameter(Mandatory=$true)][ValidateSet('install','upgrade','uninstall')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Prefix,
  [Parameter(Mandatory=$false)][string]$DataDirectory
)
$ErrorActionPreference = 'Stop'

$SelfDir      = $PSScriptRoot
$BinName      = 'mcp-studio.exe'
$PgSubdir     = 'pg'

function Ensure-Prefix {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    try { New-Item -ItemType Directory -Path $Path -Force -ErrorAction Stop | Out-Null }
    catch { throw "Cannot create PREFIX '$Path'. Try a user-writable directory like %LOCALAPPDATA%\MCPStudio or C:\Users\<me>\AppData\Local\MCP Studio." }
  }
  if (-not (Test-Path $Path -PathType Container)) { throw "PREFIX '$Path' is not a directory." }
}

function Copy-FileSafe {
  param([string]$Src, [string]$Dst)
  if (Test-Path $Src -PathType Leaf) { Copy-Item -Force $Src $Dst }
}

if ($Action -in @('install','upgrade')) {
  Ensure-Prefix $Prefix

  # Go binary — always overwrite.
  Copy-Item -Force (Join-Path $SelfDir $BinName) (Join-Path $Prefix $BinName)

  # PG binaries — copy pg/ contents if present; existing pg/ is kept on upgrade.
  $PgSrc = Join-Path $SelfDir $PgSubdir
  if (Test-Path $PgSrc -PathType Container) {
    $PgDst = Join-Path $Prefix $PgSubdir
    New-Item -ItemType Directory -Path $PgDst -Force | Out-Null
    Copy-Item -Path (Join-Path $PgSrc '*') -Destination $PgDst -Recurse -Force
  } else {
    if (-not (Test-Path (Join-Path $Prefix $PgSubdir) -PathType Container)) {
      Write-Warning 'This candidate was built without pg/ binaries.'
      Write-Warning 'Install PostgreSQL 18 separately (EDB installer) or set MCP_STUDIO_LOCAL_PG_BIN before running mcp-studio.'
    }
  }

  # Wrapper + manifest + checksums.
  Copy-FileSafe (Join-Path $SelfDir 'install-platform.ps1') (Join-Path $Prefix 'install-platform.ps1')
  Copy-FileSafe (Join-Path $SelfDir 'manifest.json')         (Join-Path $Prefix 'manifest.json')
  Copy-FileSafe (Join-Path $SelfDir 'CHECKSUMS.sha256')      (Join-Path $Prefix 'CHECKSUMS.sha256')

  # PATH shortcut — only if PREFIX is not already in PATH.
  $pathList = $env:Path -split ';'
  if ($pathList -notcontains $Prefix) {
    $Shortcuts = "$([Environment]::GetFolderPath('Desktop'))\mcp-studio.lnk"
    try {
      $WshShell = New-Object -ComObject WScript.Shell
      $Lnk = $WshShell.CreateShortcut($Shortcuts)
      $Lnk.TargetPath = (Join-Path $Prefix $BinName)
      $Lnk.Save()
    } catch { Write-Warning "Could not create desktop shortcut: $($_.Exception.Message)" }
  }
}

if ($Action -eq 'uninstall') {
  if (-not (Test-Path $Prefix)) {
    Write-Host "PREFIX '$Prefix' does not exist — nothing to uninstall."
    exit 0
  }
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Prefix $BinName)
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Prefix 'install-platform.ps1')
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Prefix 'manifest.json')
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $Prefix 'CHECKSUMS.sha256')
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $Prefix $PgSubdir)
  Remove-Item -Force -ErrorAction SilentlyContinue "$([Environment]::GetFolderPath('Desktop'))\mcp-studio.lnk"
  # Don't silently remove prefix itself — user may have their own files there.
  if ((Get-ChildItem $Prefix -Force -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0) {
    Remove-Item -Force $Prefix
  }

  if ($DataDirectory -and (Test-Path $DataDirectory)) {
    Write-Host "Installed prefix removed. Data directory preserved at:"
    Write-Host "  $DataDirectory"
    Write-Host "Remove it manually with:"
    Write-Host "  Remove-Item -Recurse -Force '$DataDirectory'"
  }
}
