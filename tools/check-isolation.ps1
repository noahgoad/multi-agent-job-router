<#
.SYNOPSIS
  Isolation check. Verifies that all files written by the project
  are inside the project root and that the README exists.
#>
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$Skip = @("node_modules", "dist", "build", ".git", "artifacts", "typechain-types")

function Walk($dir) {
  Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($Skip -contains $_.Name) { return }
    if ($_.PSIsContainer) { Walk $_.FullName }
    else { Write-Output $_.FullName }
  }
}

$ok = $true
Walk $ProjectRoot | ForEach-Object {
  if (-not $_.StartsWith($ProjectRoot)) {
    Write-Host "escape:$_"
    $ok = $false
  }
}

$readme = Join-Path $ProjectRoot "README.md"
if (-not (Test-Path $readme)) {
  Write-Host "missing:README.md"
  $ok = $false
}

if (-not $ok) { Write-Error "isolation check failed"; exit 1 }
Write-Host "isolation check passed"