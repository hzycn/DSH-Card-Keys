# Make `powershell` mean PowerShell 7 instead of Windows PowerShell 5.1.
#
# The name `powershell` is resolved by PATH. Windows ships powershell.exe inside
# %SystemRoot%\System32\WindowsPowerShell\v1.0, and the PowerShell 7 directory is earlier on
# PATH, so a file called powershell.exe there wins.
#
# A HARD LINK is used, not a symbolic one, and not a wrapper exe:
#   - `mklink powershell.exe pwsh.exe` (symbolic) makes pwsh.exe think it lives in the link's
#     directory => it looks for pwsh.dll there, does not find it, and dies with
#     "The application to execute does not exist". Placing that link in System32 therefore
#     breaks `powershell` entirely.
#   - A hard link points at the pwsh.exe *file*, so PSHOME stays the real PowerShell 7
#     directory. It also needs no administrator rights (symlinks do).
#   - Because it is a file-level link, re-run this after upgrading PowerShell 7.
#
# Usage (from a normal, non-elevated terminal):
#   pwsh -File scripts\install-powershell-shim.ps1
#   pwsh -File scripts\install-powershell-shim.ps1 -Check
#   pwsh -File scripts\install-powershell-shim.ps1 -Uninstall
#
# Windows PowerShell 5.1 itself is never touched: it stays reachable at
# %WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe by full path.

param(
    [switch]$Check,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$pwshExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwshExe) { throw 'pwsh.exe not found on PATH; install PowerShell 7 first.' }
$pwshDir = Split-Path -Parent $pwshExe
$link = Join-Path $pwshDir 'powershell.exe'
$legacy = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$systemStub = Join-Path $env:WINDIR 'System32\powershell.exe'
$appPathKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\powershell.exe'

function Get-FileId([string]$path) {
    try { return ((& fsutil file queryfileid $path) -replace '.*?0x', '').Trim() } catch { return $null }
}

function Show-Resolution {
    $first = $null
    foreach ($dir in ($env:PATH -split ';' | Where-Object { $_ -ne '' })) {
        $direct = Join-Path $dir 'powershell.exe'
        $nested = Join-Path $dir 'WindowsPowerShell\v1.0\powershell.exe'
        if (Test-Path $direct) { $first = $direct; break }
        if (Test-Path $nested) { $first = $nested; break }
    }
    Write-Host "First powershell.exe on PATH: $first"
    if ($first -ne $null) {
        try {
            $edition = & $first -NoProfile -Command '$PSVersionTable.PSEdition + " " + $PSVersionTable.PSVersion'
            Write-Host "It reports: $edition"
        }
        catch {
            Write-Host "It cannot start: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    if (Test-Path $systemStub) {
        $item = Get-Item $systemStub -Force
        Write-Host "System32\powershell.exe exists (LinkType=$($item.LinkType), Target=$($item.Target))" -ForegroundColor Yellow
        Write-Host '  A link there makes pwsh look for pwsh.dll in System32. Run -Uninstall to clear it.' -ForegroundColor Yellow
    }
    Write-Host "Windows PowerShell 5.1 by full path: $legacy"
}

if ($Check) {
    Show-Resolution
    return
}

if ($Uninstall) {
    if (Test-Path $link) {
        if ((Get-FileId $link) -eq (Get-FileId $pwshExe)) {
            # A hard link to a running executable cannot be deleted: pwsh.exe is the shell
            # executing this script, and Windows refuses while the image is mapped.
            Write-Warning "Cannot remove $link while pwsh.exe is running. Close every PowerShell 7 window, then run: del `"$link`""
        }
        else {
            Remove-Item $link -Force
            Write-Host "Removed $link"
        }
    }
    if (Test-Path $systemStub) {
        $item = Get-Item $systemStub -Force
        if ($item.LinkType -ne $null) {
            try {
                Remove-Item $systemStub -Force -ErrorAction Stop
                Write-Host "Removed leftover link $systemStub"
            }
            catch {
                Write-Warning "Cannot remove $systemStub without elevation; run -Uninstall from an elevated terminal."
            }
        }
    }
    Remove-Item $appPathKey -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Uninstalled. `powershell` resolves to Windows PowerShell 5.1 again.'
    return
}

Write-Host "==> Linking $link -> $pwshExe (hard link, no elevation)" -ForegroundColor Cyan
if (Test-Path $link) {
    if ((Get-FileId $link) -eq (Get-FileId $pwshExe)) {
        Write-Host '    already linked to pwsh.exe; nothing to do.'
    }
    else {
        $item = Get-Item $link -Force
        if ($item.LinkType -eq $null -and $item.Length -gt 64KB) {
            throw "$link is a real PowerShell binary; refusing to replace it."
        }
        try { Remove-Item $link -Force -ErrorAction Stop }
        catch {
            throw @"
Cannot replace $link while pwsh.exe is running (it is the shell executing this script).
Close every PowerShell 7 window, then run:
    del "$link"
    mklink /H "$link" "$pwshExe"
"@
        }
        New-Item -ItemType HardLink -Path $link -Target $pwshExe | Out-Null
    }
}
else {
    New-Item -ItemType HardLink -Path $link -Target $pwshExe | Out-Null
}

Write-Host ''
Show-Resolution
Write-Host ''
Write-Host 'Done. `powershell` runs PowerShell 7 from PATH and from every working directory.' -ForegroundColor Green
