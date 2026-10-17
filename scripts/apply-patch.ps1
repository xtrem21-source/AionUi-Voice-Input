<#
  apply-patch.ps1 - AiTron Voice Input
  ---------------------------------------------------------------------------
  Injects voice-input.js into an Electron app's app.asar.

  IMPORTANT: this file is intentionally 100% ASCII. Windows PowerShell 5.1
  reads scripts as ANSI when there is no BOM; non-ASCII characters (em dashes,
  curly quotes) get mangled into characters that PowerShell treats as string
  delimiters, which breaks parsing. Keep it ASCII.

  Usage:
      .\apply-patch.ps1 -Preset AionUi
      .\apply-patch.ps1 -Preset AionUi -ScriptPath ..\src\voice-input.aionui.js
      .\apply-patch.ps1 -Preset AionUi -Force        (re-apply over an existing patch)
      .\apply-patch.ps1 -Preset AionUi -Rollback     (restore the backup)

  Every run writes a timestamped log to <repo>\logs\ by default.
#>

[CmdletBinding()]
param(
    [ValidateSet('AionUi', 'OpenCowork', 'Custom')]
    [string]$Preset = 'AionUi',

    [string]$AppDir,
    [string]$HtmlRel,
    [string]$JsRel,
    [string]$ProcessName,

    [string]$ScriptPath,
    [string]$LogFile,

    [switch]$Rollback,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
$script:LogFile = $LogFile

function Write-Log {
    param(
        [string]$Message,
        [string]$Color = 'Gray'
    )
    $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message)
    Write-Host $line -ForegroundColor $Color
    if ($script:LogFile) {
        try { Add-Content -Path $script:LogFile -Value $line -Encoding UTF8 } catch { }
    }
}

if (-not $script:LogFile) {
    $logDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'logs'
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $script:LogFile = Join-Path $logDir ('patch-{0}-{1}.log' -f $Preset, (Get-Date -Format 'yyyyMMdd-HHmmss'))
}

# ---------------------------------------------------------------------------
# Presets - add a row here to support a new app
# ---------------------------------------------------------------------------
$presets = @{
    AionUi     = @{
        AppDir  = Join-Path $env:LOCALAPPDATA 'Programs\AionUi'
        HtmlRel = 'out/renderer/index.html'
        JsRel   = 'out/renderer/voice-input.js'
        Process = 'AionUi'
    }
    OpenCowork = @{
        AppDir  = Join-Path $env:LOCALAPPDATA 'Programs\Open Cowork'
        HtmlRel = 'dist/index.html'
        JsRel   = 'dist/voice-input.js'
        Process = 'Open Cowork'
    }
}

if ($Preset -ne 'Custom') {
    $p = $presets[$Preset]
    if (-not $AppDir)      { $AppDir = $p.AppDir }
    if (-not $HtmlRel)     { $HtmlRel = $p.HtmlRel }
    if (-not $JsRel)       { $JsRel = $p.JsRel }
    if (-not $ProcessName) { $ProcessName = $p.Process }
}

if (-not $ScriptPath) { $ScriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'src\voice-input.js' }

$resDir  = Join-Path $AppDir 'resources'
$asar    = Join-Path $resDir 'app.asar'
$bak     = Join-Path $resDir 'app.asar.bak'
$tmp     = $null
$newAsar = $null
$exitCode = 0

Write-Log '' 'White'
Write-Log ('=== AiTron Voice Input - preset: ' + $Preset + ' ===') 'Cyan'
Write-Log ('Date      : ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) 'DarkGray'
Write-Log ('asar      : ' + $asar) 'DarkGray'
Write-Log ('html      : ' + $HtmlRel) 'DarkGray'
Write-Log ('script    : ' + $ScriptPath) 'DarkGray'

try {
    if (-not $AppDir -or -not $HtmlRel -or -not $JsRel) {
        throw 'AppDir, HtmlRel and JsRel are required for a Custom target.'
    }
    if (-not (Test-Path $asar)) {
        throw ('app.asar not found: ' + $asar)
    }
    if (-not $Rollback -and -not (Test-Path $ScriptPath)) {
        throw ('Source script not found: ' + $ScriptPath)
    }

    # --- app must be closed -------------------------------------------------
    $running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
    if ($running) {
        $pids = ($running | ForEach-Object { $_.Id }) -join ','
        throw ("'" + $ProcessName + "' is still running (PID " + $pids + "). Close it completely, then re-run.")
    }

    # --- rollback -----------------------------------------------------------
    if ($Rollback) {
        if (-not (Test-Path $bak)) { throw ('No backup found: ' + $bak) }
        Copy-Item $bak $asar -Force
        Write-Log 'OK - app.asar restored from backup.' 'Green'
        throw '__DONE__'
    }

    # --- already patched? ---------------------------------------------------
    $raw = [System.IO.File]::ReadAllBytes($asar)
    if ([System.Text.Encoding]::Latin1.GetString($raw).Contains('voice-input.js')) {
        if (-not $Force) {
            throw 'This app.asar already contains voice-input.js (already patched). Use -Rollback to revert, or -Force to re-apply.'
        }
        if (-not (Test-Path $bak)) {
            throw ('Already patched and no clean backup at ' + $bak + '. Reinstall the app first.')
        }
        Write-Log 'Already patched -> restoring the clean backup before re-applying.' 'Yellow'
        Copy-Item $bak $asar -Force
    }

    # --- backup -------------------------------------------------------------
    Copy-Item $asar $bak -Force
    Write-Log ('Backup    : ' + $bak) 'DarkGray'

    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) { throw 'npx not found. Install Node.js (https://nodejs.org) and retry.' }

    $tmp     = Join-Path $env:TEMP ('asar-patch-' + [guid]::NewGuid().ToString('N'))
    $newAsar = Join-Path $env:TEMP ('app.asar.new-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null

    Write-Log 'Extracting the archive (can take 1-3 minutes)...' 'Gray'
    & npx --yes @electron/asar extract $asar $tmp *>&1 | ForEach-Object { Write-Log ('  ' + $_) 'DarkGray' }
    if ($LASTEXITCODE -ne 0) { throw 'asar extract failed.' }
    Write-Log 'Extract OK.' 'Green'

    # --- copy the script ----------------------------------------------------
    $jsDest = Join-Path $tmp ($JsRel -replace '/', '\')
    $jsDir  = Split-Path $jsDest -Parent
    if (-not (Test-Path $jsDir)) { throw ('Destination folder missing inside the archive: ' + $jsDir) }
    Copy-Item $ScriptPath $jsDest -Force
    Write-Log ('Added     : ' + $JsRel) 'Green'

    # --- inject the script tag ---------------------------------------------
    $htmlDest = Join-Path $tmp ($HtmlRel -replace '/', '\')
    if (-not (Test-Path $htmlDest)) { throw ('HTML entry missing inside the archive: ' + $htmlDest) }

    $html = [System.IO.File]::ReadAllText($htmlDest)
    if ($html -notmatch 'voice-input\.js') {
        $tag  = '<script src="./voice-input.js"></script>'
        $repl = '  ' + $tag + "`r`n</body>"
        $html = [regex]::Replace($html, '</body>', $repl, 'IgnoreCase')
        $enc = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($htmlDest, $html, $enc)
        Write-Log ('Injected  : script tag into ' + $HtmlRel) 'Green'
    }
    else {
        Write-Log ('Injected  : tag already present in ' + $HtmlRel + ' (skipped)') 'Yellow'
    }

    # --- repack -------------------------------------------------------------
    Write-Log 'Repacking...' 'Gray'
    & npx --yes @electron/asar pack $tmp $newAsar *>&1 | ForEach-Object { Write-Log ('  ' + $_) 'DarkGray' }
    if ($LASTEXITCODE -ne 0) { throw 'asar pack failed.' }

    $oldSize = (Get-Item $asar).Length
    $newSize = (Get-Item $newAsar).Length
    if ($newSize -lt ($oldSize * 0.9)) {
        throw ('Repacked archive looks too small (' + $newSize + ' bytes, was ' + $oldSize + '). Aborted, original untouched.')
    }

    Copy-Item $newAsar $asar -Force
    Write-Log ('OK - patched. ' + $oldSize + ' -> ' + $newSize + ' bytes (+' + ([math]::Round(($newSize - $oldSize) / 1KB)) + ' KB)') 'Green'
    Write-Log ('Rollback: .\apply-patch.ps1 -Preset ' + $Preset + ' -Rollback') 'DarkGray'
}
catch {
    if ($_.Exception.Message -eq '__DONE__') {
        $exitCode = 0
    }
    else {
        Write-Log ('ECHEC : ' + $_.Exception.Message) 'Red'
        if ($_.Exception.StackTrace) { Write-Log ('  ' + $_.Exception.StackTrace) 'DarkGray' }
        $exitCode = 1
    }
}
finally {
    if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    if ($newAsar -and (Test-Path $newAsar)) { Remove-Item $newAsar -Force -ErrorAction SilentlyContinue }
}

Write-Log ('Journal   : ' + $script:LogFile) 'DarkGray'
exit $exitCode
