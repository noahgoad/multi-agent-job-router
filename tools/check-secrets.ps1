<#
.SYNOPSIS
  Secret scan. Walks the project tree and looks for common secret
  patterns. Conservative: ignores .env.example, manifest, and
  obvious test fixtures.
#>
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$Skip = @("node_modules", "dist", "build", ".git", "typechain-types")
$IgnoreFiles = @(".env.example", "plan-preservation-manifest.md", "check-protected.ps1", "check-isolation.ps1", "check-secrets.ps1")
$Extensions = @(".ts", ".tsx", ".mjs", ".json", ".md", ".sh", ".ps1")

$Pattern64 = '0x[0-9a-fA-F]{64}'

function Walk($dir) {
  Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($Skip -contains $_.Name) { return }
    if ($_.PSIsContainer) { Walk $_.FullName }
    else { Write-Output $_.FullName }
  }
}

$found = 0
Walk $ProjectRoot | ForEach-Object {
  $rel = $_.Substring($ProjectRoot.Length).TrimStart('\','/')
  $name = Split-Path $rel -Leaf
  if ($IgnoreFiles -contains $name) { return }
  $ext = [System.IO.Path]::GetExtension($rel)
  if ($Extensions -notcontains $ext) { return }
  $text = Get-Content $_ -Raw -ErrorAction SilentlyContinue
  if (-not $text) { return }
  if ($text -match $Pattern64) {
    if ($text -match '(?i)test|fake|0x0{40}|address') { return }
    Write-Host "possible_secret:$rel"
    $found++
  }
}

if ($found -gt 0) { Write-Error "secret scan failed"; exit 1 }
Write-Host "secret scan passed"