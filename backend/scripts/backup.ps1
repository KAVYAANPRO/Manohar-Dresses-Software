<#
.SYNOPSIS
  Backs up the Garment ERP MongoDB database with mongodump into a timestamped folder, then
  prunes old backups.

.DESCRIPTION
  Reads MONGO_URI from the backend .env (or from the MONGO_URI environment variable if set).
  The URI - which contains the database password - is never printed and never put on the
  mongodump command line (where other processes could read it): it is written to a temporary
  config file readable only by the current user, passed with --config, and deleted afterwards.

  Output: <OutDir>\garment-erp-<yyyyMMdd-HHmmss>\ (gzip-compressed BSON, one folder per backup).
  Retention: backups older than -KeepDays are deleted, but the newest -KeepMin are always kept.

  Requires the MongoDB Database Tools (mongodump). See README "Backups".

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -OutDir D:\erp-backups -KeepDays 30 -KeepMin 7
.EXAMPLE
  # Restore (DANGER: overwrites collections in the target DB):
  # mongorestore --config <file with uri: ...> --gzip --drop <backup folder>
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env'),
  [string]$OutDir = (Join-Path $PSScriptRoot '..\backups'),
  [int]$KeepDays = 14,
  [int]$KeepMin = 5
)

$ErrorActionPreference = 'Stop'

$mongodump = Get-Command mongodump -ErrorAction SilentlyContinue
if (-not $mongodump) {
  Write-Error 'mongodump not found. Install the MongoDB Database Tools (see README "Backups") and make sure mongodump is on PATH.'
  exit 1
}

$uri = $env:MONGO_URI
if (-not $uri) {
  if (-not (Test-Path $EnvFile)) { Write-Error "No MONGO_URI in the environment and no .env at $EnvFile"; exit 1 }
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*MONGO_URI\s*=\s*(.+?)\s*$') { $uri = $Matches[1].Trim('"', "'"); break }
  }
}
if (-not $uri) { Write-Error 'MONGO_URI not found.'; exit 1 }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $OutDir "garment-erp-$stamp"

# Temporary config file holding the URI, restricted to the current user.
$cfg = Join-Path ([System.IO.Path]::GetTempPath()) ("mongodump-" + [guid]::NewGuid().ToString('N') + '.yaml')
try {
  Set-Content -Path $cfg -Value ("uri: `"" + $uri.Replace('"', '\"') + "`"") -Encoding ascii
  try {
    $acl = Get-Acl $cfg
    $acl.SetAccessRuleProtection($true, $false)
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'Allow')))
    Set-Acl $cfg $acl
  } catch { }

  Write-Host "Backing up to $target ..."
  & $mongodump.Source --config $cfg --gzip --out $target
  if ($LASTEXITCODE -ne 0) { throw "mongodump failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $cfg
}

# Retention: drop folders older than KeepDays, never the newest KeepMin.
$all = Get-ChildItem -Directory -Path $OutDir -Filter 'garment-erp-*' | Sort-Object Name -Descending
$cutoff = (Get-Date).AddDays(-$KeepDays)
$all | Select-Object -Skip $KeepMin | Where-Object { $_.CreationTime -lt $cutoff } | ForEach-Object {
  Write-Host "Removing old backup $($_.Name)"
  Remove-Item -Recurse -Force $_.FullName
}

$size = (Get-ChildItem -Recurse -File $target | Measure-Object -Sum Length).Sum
Write-Host ("Backup complete: {0} ({1:N1} MB)" -f $target, ($size / 1MB))
