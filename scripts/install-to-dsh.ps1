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

# The profile's node_modules is a pnpm install (`nodeLinker: hoisted`), and DSH verifies it
# against pnpm-lock.yaml at startup. Install it with the pnpm DSH itself ships, so the
# lockfile the desktop app checks is exactly the one this script writes. A plain `npm
# install` leaves the lockfile pointing at the previous tarball, which makes DSH prompt to
# repair the profile or keep loading the stale plugin.
function Get-BundledPnpm {
    $runtime = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\primary-runtime\dependencies'
    $node = Join-Path $runtime 'node\bin\node.exe'
    $pnpm = Join-Path $runtime 'pnpm\bin\pnpm.cjs'
    if ((Test-Path $node) -and (Test-Path $pnpm)) { return @{ node = $node; pnpm = $pnpm } }
    return $null
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
$bundled = Get-BundledPnpm
Push-Location $profileRoot
try {
    if ($bundled -ne $null) {
        # Point the profile at this checkout's tarball, then let pnpm rewrite both the
        # lockfile specifier/integrity and node_modules in one resolution step. Only the
        # one specifier line is replaced: re-serializing the manifest would reflow the
        # whole file, and the profile is user-owned configuration.
        $specifier = "file:$($tarball -replace '\\', '/')"
        $manifestText = Get-Content 'package.json' -Raw
        $updated = [regex]::Replace(
            $manifestText,
            '("@hzy/dsh-card-keys"\s*:\s*)"[^"]*"',
            { param($match) $match.Groups[1].Value + '"' + $specifier + '"' }
        )
        if ($updated -ne $manifestText) {
            [System.IO.File]::WriteAllText((Join-Path (Get-Location) 'package.json'), $updated)
        }
        # A `file:` dependency keeps the same specifier across rebuilds, so pnpm reports
        # "Already up to date" and leaves the previously extracted copy in place. Removing
        # the installed directory first makes the install actually re-extract this tarball.
        $installed = Join-Path 'node_modules\@hzy' $entryId
        if (Test-Path $installed) { Remove-Item -Recurse -Force $installed }
        & $bundled.node $bundled.pnpm install --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install into profile failed' }
    }
    else {
        Write-Host '    bundled pnpm not found; falling back to npm (lockfile will go stale)' -ForegroundColor Yellow
        npm install $tarball --ignore-scripts --no-audit --no-fund --legacy-peer-deps
        if ($LASTEXITCODE -ne 0) { throw 'npm install into profile failed' }
    }
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
