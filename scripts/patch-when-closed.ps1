<#
  patch-when-closed.ps1
  ---------------------------------------------------------------------------
  Attend que AionUi soit ferme, applique le correctif micro, puis relance AionUi.

  Lance ce script via APPLIQUER-MIC-AIONUI.cmd (double-clic).
  Il est ecrit pour tourner HORS de AionUi : c'est pour ca qu'il ne peut pas
  etre execute par l'agent depuis l'interieur de l'application.
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$appExe   = Join-Path $env:LOCALAPPDATA 'Programs\AionUi\AionUi.exe'
$procName = 'AionUi'
$script   = Join-Path $repoRoot 'src\voice-input.aionui.js'
$logFile  = Join-Path $repoRoot 'patch-aionui.log'

function Say($msg, $color = 'White') { Write-Host $msg -ForegroundColor $color }

try { $Host.UI.RawUI.WindowTitle = 'AiTron Voice Input — installation pour AionUi' } catch {}

Say ''
Say '======================================================' Cyan
Say '   AiTron Voice Input  ->  AionUi' Cyan
Say '======================================================' Cyan
Say ''
Say 'Ce script va :' White
Say '  1. attendre que AionUi soit FERME' Gray
Say '  2. sauvegarder app.asar' Gray
Say '  3. ajouter le bouton micro' Gray
Say '  4. relancer AionUi' Gray
Say ''
Say '  ==> FERME AionUi MAINTENANT (Fichier > Quitter)' Yellow
Say '      Cette fenetre continuera toute seule.' Yellow
Say ''

# --- 1. attente -------------------------------------------------------------
$deadline = (Get-Date).AddMinutes(15)
$waited   = $false
while (Get-Process -Name $procName -ErrorAction SilentlyContinue) {
    if ((Get-Date) -gt $deadline) {
        Say 'AionUi est toujours ouvert apres 15 min. Abandon.' Red
        Say 'Relance ce script quand tu seras pret.' Yellow
        exit 1
    }
    Start-Sleep -Seconds 2
    if (-not $waited) { Say 'En attente de la fermeture...' DarkGray; $waited = $true }
}

Say ''
Say 'AionUi est ferme. Attente de la liberation du fichier...' Green
Start-Sleep -Seconds 4

# --- 2. patch (avec 3 tentatives si fichier verrouille) ---------------------
$ok = $false
$err = $null
for ($i = 1; $i -le 3 -and -not $ok; $i++) {
    try {
        Say "Application du correctif (tentative $i/3)..." Cyan
        & (Join-Path $PSScriptRoot 'apply-patch.ps1') -Preset AionUi -ScriptPath $script *>&1 |
            Tee-Object -FilePath $logFile -Append | ForEach-Object { Say $_ DarkGray }
        $ok = $true
    }
    catch {
        $err = $_.Exception.Message
        Say "Echec : $err" Red
        if ($i -lt 3) { Say 'Nouvelle tentative dans 5 s...' Yellow; Start-Sleep -Seconds 5 }
    }
}

# --- 3. resultat ------------------------------------------------------------
Say ''
if ($ok) {
    Say 'CORRECTIF APPLIQUE.' Green
    Say 'Le bouton micro apparaitra a droite de la fleche d envoi.' Gray
    Say ' >>> Clic droit sur le micro pour coller ta cle Gemini <<<' Yellow
}
else {
    Say 'LE CORRECTIF A ECHOUE — AionUi sera relance sans modification.' Red
    Say "Detail : $err" Red
    Say "Journal : $logFile" DarkGray
}

# --- 4. relance -------------------------------------------------------------
if (Test-Path $appExe) {
    Say ''
    Say 'Relance de AionUi...' Cyan
    Start-Process -FilePath $appExe
}
else {
    Say "AionUi.exe introuvable a cet emplacement : $appExe" Yellow
    Say 'Relance-le manuellement.' Yellow
}

Say ''
if ($ok) { Say 'Termine. Tu peux fermer cette fenetre.' Green }
else { Say 'Termine (avec erreur). Tu peux fermer cette fenetre.' Red }
Start-Sleep -Seconds 3
