@echo off
setlocal
title AiTron Voice Input - Mise a jour pour AionUi
cd /d "%~dp0"

echo.
echo  ============================================================
echo    AiTron Voice Input  -  MISE A JOUR
echo  ============================================================
echo.
echo    A utiliser quand le correctif est DEJA installe et que tu
echo    veux la version courante du script.
echo.
echo    Le script restaure d'abord la sauvegarde propre,
echo    puis reapplique la nouvelle version.
echo.
echo    PREREQUIS : AionUi COMPLETEMENT ferme.
echo.
echo    Un journal (.log) est ecrit dans le dossier logs.
echo  ------------------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply-patch.ps1" -Preset AionUi -ScriptPath "%~dp0src\voice-input.aionui.js" -Force

if errorlevel 1 goto :echec

echo.
echo  ============================================================
echo    MISE A JOUR TERMINEE - relance AionUi.
echo    Journal : dossier "logs" (fichier patch-AionUi-*.log)
echo  ============================================================
echo.
pause
exit /b 0

:echec
echo.
echo  ============================================================
echo    ECHEC - voir le detail dans le dossier "logs"
echo    (fichier patch-AionUi-*.log). Sauvegarde intacte :
echo    resources\app.asar.bak
echo  ============================================================
echo.
pause
exit /b 1
