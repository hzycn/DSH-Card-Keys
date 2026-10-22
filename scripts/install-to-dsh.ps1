# Build, pack, and install this plugin into the local DeepSeek Harness desktop profile.
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install-to-dsh.ps1            # build + install
#   powershell -ExecutionPolicy Bypass -File scripts\install-to-dsh.ps1 -SkipBuild # install only
# After installing, restart DeepSeek Harness to reload the composition.

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$patchFile = Join-Path $profileRoot 'cordis.patch.yml'
$entryId = 'dsh-card-keys'

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Set-Location $projectRoot

if (-not $SkipBuild) {
    Write-Host '==> Building (typecheck + bundle)...' -ForegroundColor Cyan
    if (Test-Command pnpm) { pnpm run bundle }
    else { npm run bundle }
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
}
elseif (-not (Test-Path (Join-Path $projectRoot 'lib\client.js'))) {
    throw 'lib/client.js is missing; run without -SkipBuild first.'
}

Write-Host '==> Packing tarball...' -ForegroundColor Cyan
$packOutput = npm pack --ignore-scripts --pack-destination $projectRoot
if ($LASTEXITCODE -ne 0) { throw 'npm pack failed' }
$tarball = Join-Path $projectRoot ($packOutput | Select-Object -Last 1)
Write-Host "    $tarball"

Write-Host '==> Installing into desktop profile...' -ForegroundColor Cyan
Push-Location $profileRoot
try {
    npm install $tarball --ignore-scripts --no-audit --no-fund --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) { throw 'npm install into profile failed' }
}
finally { Pop-Location }

Write-Host '==> Ensuring composition entry...' -ForegroundColor Cyan
$patchText = Get-Content $patchFile -Raw
$entryLine = "  name: `"@hzy/dsh-card-keys`""
if ($patchText -match [regex]::Escape($entryLine)) {
    Write-Host '    entry already present, skipped.'
}
else {
    Add-Content $patchFile @'

# Card keyboard control for question/approval prompts (local plugin package).
- id: dsh-card-keys
  name: "@hzy/dsh-card-keys"
'@
    Write-Host '    entry appended to cordis.patch.yml.'
}

Write-Host ''
Write-Host 'Done. Restart DeepSeek Harness to load the plugin.' -ForegroundColor Green
Write-Host 'Afterwards: plugin settings page -> enable card keyboard control;'
Write-Host 'the number-key row also appears in Settings -> Keyboard shortcuts (approval group).'
