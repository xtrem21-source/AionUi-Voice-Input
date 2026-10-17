<#
.SYNOPSIS
    Injects voice-input.js into an Electron app's app.asar.

.DESCRIPTION
    Extracts app.asar, drops src/voice-input.js next to the renderer's index.html,
    injects a <script> tag before </body>, repacks, and swaps the archive in.
    A backup (app.asar.bak) is always created first.

.PARAMETER Preset
    AionUi | OpenCowork | Custom

.PARAMETER AppDir
    Application folder (required for Custom), e.g. C:\Apps\MyApp

.PARAMETER HtmlRel
    index.html path INSIDE the asar (required for Custom)

.PARAMETER JsRel
    Destination path for the script INSIDE the asar (required for Custom)

.PARAMETER ProcessName
    Process to check is not running. Defaults to the app folder's leaf name.

.PARAMETER ScriptPath
    Source script. Defaults to ../src/voice-input.js

.EXAMPLE
    .\apply-patch.ps1 -Preset AionUi

.EXAMPLE
    .\apply-patch.ps1 -Preset Custom -AppDir "C:\Apps\MyApp" `
        -HtmlRel "dist/index.html" -JsRel "dist/voice-input.js" -ProcessName "MyApp"
#>

[CmdletBinding()]
param(
    [ValidateSet('AionUi', 'OpenCowork', 'Custom')]
    [string]$Preset = 'AionUi',

    [string]$AppDir,
    [string]$HtmlRel,
    [string]$JsRel,
    [string]$ProcessName,

    [string]$ScriptPath = (Join-Path $PSScriptRoot '..\src\voice-input.js'),

    [switch]$Rollback,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Presets — add a row here to support a new app
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
    if (-not $AppDir)    { $AppDir    = $p.AppDir }
    if (-not $HtmlRel)   { $HtmlRel   = $p.HtmlRel }
    if (-not $JsRel)     { $JsRel     = $p.JsRel }
    if (-not $ProcessName) { $ProcessName = $p.Process }
}

if (-not $AppDir -or -not $HtmlRel -or -not $JsRel) {
    throw "AppDir, HtmlRel and JsRel are required for a Custom target."
}

$resDir = Join-Path $AppDir 'resources'
$asar   = Join-Path $resDir 'app.asar'
$bak    = Join-Path $resDir 'app.asar.bak'

if (-not (Test-Path $asar)) { throw "app.asar not found: $asar" }

Write-Host "=== AiTron Voice Input :: $Preset ===" -ForegroundColor Cyan
Write-Host "asar      : $asar"
Write-Host "html      : $HtmlRel"
Write-Host "script -> : $JsRel"

# --- app must be closed ------------------------------------------------------
$running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
if ($running) {
    throw "'$ProcessName' is still running (PID $($running.Id -join ',')). Close it completely, then re-run."
}

# --- rollback ----------------------------------------------------------------
if ($Rollback) {
    if (-not (Test-Path $bak)) { throw "No backup found: $bak" }
    Copy-Item $bak $asar -Force
    Write-Host "OK — app.asar restored from backup." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $ScriptPath)) { throw "Source script not found: $ScriptPath" }

# --- already patched? --------------------------------------------------------
$raw = [System.IO.File]::ReadAllBytes($asar)
if ([System.Text.Encoding]::Latin1.GetString($raw).Contains('voice-input.js')) {
    if (-not $Force) {
        throw "This app.asar already contains voice-input.js (already patched). Use -Rollback to revert, or -Force to re-apply."
    }
    if (-not (Test-Path $bak)) {
        throw "Already patched, but no backup ($bak) to start from. Reinstall the app, or run -Rollback if a backup exists."
    }
    Write-Host "Already patched -> restoring the clean backup before re-applying." -ForegroundColor Yellow
    Copy-Item $bak $asar -Force
    $raw = [System.IO.File]::ReadAllBytes($asar)
}

# --- backup ------------------------------------------------------------------
if (-not $Force -or -not (Test-Path $bak)) {
    Copy-Item $asar $bak -Force
}
Write-Host "Backup    : $bak" -ForegroundColor DarkGray

$tmp     = Join-Path $env:TEMP ("asar-patch-" + [guid]::NewGuid().ToString('N'))
$newAsar = Join-Path $env:TEMP ("app.asar.new-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
    Write-Host "Extracting (this can take a few minutes for large archives)..." -NoNewline
    & npx --yes @electron/asar extract $asar $tmp *> $null
    if ($LASTEXITCODE -ne 0) { throw "asar extract failed (is Node.js installed?)." }
    Write-Host " done."

    $jsDest = Join-Path $tmp ($JsRel -replace '/', '\')
    $jsDir  = Split-Path $jsDest -Parent
    if (-not (Test-Path $jsDir)) { throw "Destination folder missing inside the archive: $jsDir" }
    Copy-Item $ScriptPath $jsDest -Force
    Write-Host "Added     : $JsRel"

    $htmlDest = Join-Path $tmp ($HtmlRel -replace '/', '\')
    if (-not (Test-Path $htmlDest)) { throw "HTML entry missing inside the archive: $htmlDest" }
    $html = Get-Content $htmlDest -Raw
    if ($html -notmatch 'voice-input\.js') {
        $snippet = "  <script src=""./voice-input.js""></script>`r`n</body>"
        $html = [regex]::Replace($html, '</body>', $snippet, 'IgnoreCase')
        Set-Content -Path $htmlDest -Value $html -NoNewline -Encoding utf8
        Write-Host "Injected  : <script> into $HtmlRel"
    }
    else {
        Write-Host "Injected  : already present, skipped" -ForegroundColor Yellow
    }

    Write-Host "Repacking..." -NoNewline
    & npx --yes @electron/asar pack $tmp $newAsar *> $null
    if ($LASTEXITCODE -ne 0) { throw "asar pack failed." }
    Write-Host " done."

    $oldSize = (Get-Item $asar).Length
    $newSize = (Get-Item $newAsar).Length
    if ($newSize -lt ($oldSize * 0.9)) {
        throw "Repacked archive looks too small ($newSize vs $oldSize). Aborted — original untouched."
    }

    Copy-Item $newAsar $asar -Force
    Write-Host ("OK — patched. {0:N0} -> {1:N0} bytes" -f $oldSize, $newSize) -ForegroundColor Green
    Write-Host "Rollback: .\apply-patch.ps1 -Preset $Preset -Rollback" -ForegroundColor DarkGray
}
finally {
    if (Test-Path $tmp)     { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $newAsar) { Remove-Item $newAsar -Force -ErrorAction SilentlyContinue }
}
