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
      .\apply-patch.ps1 -Preset AionUi -NoKill       (never close the app automatically)

  The app is force-closed if it is still running (3 s countdown, Ctrl+C to
  cancel) because Windows keeps app.asar locked while the process is alive.

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
    [switch]$Force,
    [switch]$NoKill
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
$unpackedDir = Join-Path $resDir 'app.asar.unpacked'
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

    # --- close the app (force) ----------------------------------------------
    # Windows keeps app.asar locked while the app runs, so the script closes it.
    $running = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        $pids = ($running | ForEach-Object { $_.Id }) -join ','
        Write-Log ("'" + $ProcessName + "' is running (PID " + $pids + ").") 'Yellow'

        if ($NoKill) {
            throw ("'" + $ProcessName + "' is still running (PID " + $pids + "). Close it completely, then re-run.")
        }

        Write-Log 'Force-closing it in 3 seconds - press Ctrl+C to cancel...' 'Yellow'
        for ($i = 3; $i -ge 1; $i--) {
            Write-Host ('   ' + $i) -ForegroundColor Yellow
            Start-Sleep -Seconds 1
        }

        try { Stop-Process -Name $ProcessName -Force -ErrorAction SilentlyContinue } catch { }
        Start-Sleep -Milliseconds 400
        if (@(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue).Count -gt 0) {
            try {
                & taskkill /F /T /IM ($ProcessName + '.exe') *>&1 |
                    ForEach-Object { Write-Log ('  ' + $_) 'DarkGray' }
            }
            catch { }
        }

        # wait until the file lock is really released (up to 20 s)
        $deadline = (Get-Date).AddSeconds(20)
        $left = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
        while ($left.Count -gt 0 -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 400
            $left = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
        }

        if ($left.Count -gt 0) {
            $lp = ($left | ForEach-Object { $_.Id }) -join ','
            throw ("Could not close '" + $ProcessName + "' (PID " + $lp + " still alive after 20 s). Close it from Task Manager, then re-run.")
        }

        Write-Log 'App closed.' 'Green'

        # a stray backend process would make the next launch fail: report it
        $orphan = @(Get-Process -Name 'aioncore' -ErrorAction SilentlyContinue)
        if ($orphan.Count -gt 0) {
            $op = ($orphan | ForEach-Object { $_.Id }) -join ','
            Write-Log ('Note      : backend aioncore still alive (PID ' + $op + '), left untouched on purpose.') 'DarkGray'
        }

        Start-Sleep -Milliseconds 700
    }
    else {
        Write-Log 'App already closed - good.' 'Green'
    }

    # --- rollback -----------------------------------------------------------
    if ($Rollback) {
        if (-not (Test-Path $bak)) { throw ('No backup found: ' + $bak) }
        Copy-Item $bak $asar -Force
        Write-Log 'OK - app.asar restored from backup.' 'Green'
        throw '__DONE__'
    }

    # --- already patched? ---------------------------------------------------
    # Only the header (first bytes) can contain the file names: reading the whole
    # 300+ MB archive into memory was slow and could exhaust PowerShell 5.1.
    $fs = [System.IO.File]::OpenRead($asar)
    try {
        $head = New-Object byte[] 16
        [void]$fs.Read($head, 0, 16)
        $headerSize = [BitConverter]::ToUInt32($head, 12)
        $take = [int][math]::Min([int64]16777216, [int64]$headerSize + 16)
        $fs.Position = 0
        $buf = New-Object byte[] $take
        [void]$fs.Read($buf, 0, $take)
    }
    finally {
        $fs.Dispose()
    }
    # Latin1 via GetEncoding(28591): [Text.Encoding]::Latin1 only exists in .NET 5+,
    # it is $null under Windows PowerShell 5.1 (the engine the .bat uses).
    if ([System.Text.Encoding]::GetEncoding(28591).GetString($buf).Contains('voice-input.js')) {
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

    # --- preserve the original app.asar.unpacked layout ----------------------
    # @electron/asar extract materialises the files that were marked "unpacked"
    # inside the temp folder; a plain repack would then embed them in app.asar
    # (+50 MB here) and could break native modules. We rebuild the same split:
    # node_modules package roots go to --unpack-dir, other loose files to --unpack.
    $unpackArgs = @()
    $unpackedCount = 0
    if (Test-Path $unpackedDir) {
        $prefixLen = $unpackedDir.TrimEnd('\').Length + 1
        $unpackedFiles = @(Get-ChildItem -Path $unpackedDir -Recurse -File -ErrorAction SilentlyContinue |
            ForEach-Object { $_.FullName.Substring($prefixLen) -replace '\\', '/' })
        $unpackedCount = $unpackedFiles.Count
        $pkgDirs = @()
        $looseFiles = @()
        foreach ($rel in $unpackedFiles) {
            if ($rel -match '^node_modules/(@[^/]+/[^/]+|[^/]+)/') {
                $pkg = 'node_modules/' + $Matches[1]
                if ($pkgDirs -notcontains $pkg) { $pkgDirs += $pkg }
            }
            else {
                if ($looseFiles -notcontains $rel) { $looseFiles += $rel }
            }
        }
        if ($pkgDirs.Count -gt 0) {
            $unpackArgs += '--unpack-dir'
            $unpackArgs += ('{' + ($pkgDirs -join ',') + '}')
        }
        if ($looseFiles.Count -gt 0) {
            # literal paths do not match under Windows in @electron/asar; **/rel/path does.
            $globs = @()
            foreach ($rel in $looseFiles) {
                $glob = '**/' + $rel
                if ($globs -notcontains $glob) { $globs += $glob }
            }
            $unpackArgs += '--unpack'
            $unpackArgs += ('{' + ($globs -join ',') + '}')
        }
        Write-Log ('Unpacked  : ' + $unpackedCount + ' files to keep outside the archive') 'DarkGray'
    }

    # --- repack -------------------------------------------------------------
    Write-Log 'Repacking...' 'Gray'
    $packArgs = @('--yes', '@electron/asar', 'pack', $tmp, $newAsar) + $unpackArgs
    & npx @packArgs *>&1 | ForEach-Object { Write-Log ('  ' + $_) 'DarkGray' }
    if ($LASTEXITCODE -ne 0) { throw 'asar pack failed.' }

    $oldSize = (Get-Item $asar).Length
    $newSize = (Get-Item $newAsar).Length
    if ($newSize -lt ($oldSize * 0.9)) {
        throw ('Repacked archive looks too small (' + $newSize + ' bytes, was ' + $oldSize + '). Aborted, original untouched.')
    }
    # The new archive must only grow by the injected script (plus a small
    # header/alignment margin): a bigger jump means unpacked files were folded in.
    $scriptSize = (Get-Item $ScriptPath).Length
    $maxGrowth = [math]::Max(5MB, [int64]$scriptSize * 20)
    if ($newSize -gt ($oldSize + $maxGrowth)) {
        throw ('Repacked archive is unexpectedly large (' + $newSize + ' bytes, was ' + $oldSize + '). Unpacked files were probably folded in. Aborted, original untouched.')
    }

    # --- restore the unpacked split -----------------------------------------
    $newUnpacked = $newAsar + '.unpacked'
    if (Test-Path $newUnpacked) {
        if (-not (Test-Path $unpackedDir)) {
            New-Item -ItemType Directory -Path $unpackedDir -Force | Out-Null
        }
        Copy-Item (Join-Path $newUnpacked '*') $unpackedDir -Recurse -Force
        $prefixNew = $newUnpacked.TrimEnd('\').Length + 1
        $newUnpackedFiles = @(Get-ChildItem -Path $newUnpacked -Recurse -File |
            ForEach-Object { $_.FullName.Substring($prefixNew) -replace '\\', '/' })
        $newCount = $newUnpackedFiles.Count
        Write-Log ('Unpacked  : ' + $newCount + ' files restored outside the archive') 'Green'
        $missing = @($unpackedFiles | Where-Object { $newUnpackedFiles -notcontains $_ })
        if ($missing.Count -gt 0) {
            throw ('Repacked archive lost ' + $missing.Count + ' unpacked file(s), e.g. ' + $missing[0] + '. Aborted, original untouched.')
        }
    }
    elseif ($unpackedCount -gt 0) {
        throw ('The original archive has ' + $unpackedCount + ' unpacked files, but the repacked one has none. Aborted, original untouched.')
    }

    Copy-Item $newAsar $asar -Force
    $delta = $newSize - $oldSize
    $deltaText = if ($delta -ge 0) { '+' + [math]::Round($delta / 1KB) } else { [string][math]::Round($delta / 1KB) }
    Write-Log ('OK - patched. ' + $oldSize + ' -> ' + $newSize + ' bytes (' + $deltaText + ' KB)') 'Green'
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
    if ($newAsar -and (Test-Path ($newAsar + '.unpacked'))) { Remove-Item ($newAsar + '.unpacked') -Recurse -Force -ErrorAction SilentlyContinue }
    if ($newAsar -and (Test-Path $newAsar)) { Remove-Item $newAsar -Force -ErrorAction SilentlyContinue }
}

Write-Log ('Journal   : ' + $script:LogFile) 'DarkGray'
exit $exitCode
