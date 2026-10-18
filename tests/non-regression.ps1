param(
    [int]$Port = 9222,
    [switch]$Launch
)

$ErrorActionPreference = 'Stop'

if ($Launch) {
    $exe = Join-Path $env:LOCALAPPDATA 'Programs\AionUi\AionUi.exe'
    if (-not (Test-Path $exe)) {
        throw ('AionUi not found: ' + $exe)
    }
    Write-Host ('Launching AionUi with CDP on port ' + $Port + '...')
    Start-Process -FilePath $exe -ArgumentList ('--remote-debugging-port=' + $Port)
    Start-Sleep -Seconds 12
}

$test = Join-Path $PSScriptRoot 'non-regression.js'
node $test --port $Port
exit $LASTEXITCODE
