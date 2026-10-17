@echo off
setlocal
title AiTron Voice Input - Mise a jour pour AionUi
cd /d "%~dp0"

echo.
echo  ============================================================
echo    AiTron Voice Input  -  MISE A JOUR (deja patche)
echo  ============================================================
echo.
echo    A utiliser quand le correctif est DEJA installe et que tu
echo    veux la nouvelle version du script (placement, correctifs).
echo.
echo    Le script restaure d'abord la sauvegarde propre, puis
echo    reapplique la version courante.
echo.
echo    PREREQUIS : AionUi COMPLETEMENT ferme.
echo  ------------------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply-patch.ps1" -Preset AionUi -ScriptPath "%~dp0src\voice-input.aionui.js" -Force

if errorlevel 1 goto :echec

echo.
echo  ============================================================
echo    MISE A JOUR TERMINEE - relance AionUi.
echo  ============================================================
echo.
pause
exit /b 0

:echec
echo.
echo  ============================================================
echo    ECHEC - voir le detail ci-dessus.
echo    Sauvegarde intacte : resources\app.asar.bak
echo  ============================================================
echo.
pause
exit /b 1
