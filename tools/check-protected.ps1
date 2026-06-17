<#
.SYNOPSIS
  Plan-preservation check. Recomputes SHA-256 of every protected file
  and compares with the values in docs/plan-preservation-manifest.md.
#>
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$Manifest = Join-Path $ProjectRoot "docs\plan-preservation-manifest.md"

if (-not (Test-Path $Manifest)) { Write-Error "missing manifest"; exit 1 }
$text = Get-Content $Manifest -Raw
# Pull every line that contains a 64-hex token AND a `.md` path.
$lines = $text -split "`r?`n"
$entries = @()
foreach ($line in $lines) {
  if ($line -notmatch '`([0-9a-fA-F]{64})`') { continue }
  if ($line -notmatch '`([^`]*\.md)`') { continue }
  $hashMatch = [regex]::Match($line, '`([0-9a-fA-F]{64})`')
  $pathMatch = [regex]::Match($line, '`([^`]*\.md)`')
  $entries += [pscustomobject]@{
    Path = $pathMatch.Groups[1].Value
    Hash = $hashMatch.Groups[1].Value.ToLower()
  }
}
if ($entries.Count -eq 0) { Write-Error "manifest empty or malformed"; exit 1 }

$ok = $true
foreach ($e in $entries) {
  $rel = $e.Path.Replace('\','/')
  $expected = $e.Hash
  $abs = Join-Path $ProjectRoot ($rel -replace '/', [System.IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path $abs)) {
    Write-Host "missing:$rel"
    $ok = $false
    continue
  }
  $hashObj = Get-FileHash -Algorithm SHA256 $abs
  $h = $hashObj.Hash.ToLower()
  if ($h -ne $expected) {
    Write-Host "mismatch:$rel expected=$expected actual=$h"
    $ok = $false
  } else {
    Write-Host "ok:$rel"
  }
}
if (-not $ok) { Write-Error "protected file hash check failed"; exit 1 }
Write-Host "protected file hash check passed"