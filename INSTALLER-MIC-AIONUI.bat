@echo off
setlocal
title AiTron Voice Input - Installation pour AionUi
cd /d "%~dp0"

echo.
echo  ============================================================
echo    AiTron Voice Input  -  bouton micro pour AionUi
echo  ============================================================
echo.
echo    PREREQUIS : AionUi doit etre COMPLETEMENT ferme
echo                (fenetre + icone dans la barre des taches).
echo.
echo    Ce script va :
echo      1. sauvegarder resources\app.asar  ->  app.asar.bak
echo      2. ajouter le bouton micro
echo      3. recompresser l'archive
echo.
echo    En cas de probleme : app.asar.bak permet de tout restaurer.
echo  ------------------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply-patch.ps1" -Preset AionUi -ScriptPath "%~dp0src\voice-input.aionui.js"

if errorlevel 1 goto :echec

echo.
echo  ============================================================
echo    TERMINE - correctif applique.
echo.
echo    Relance AionUi, puis :
echo      - le micro apparait a cote / au-dessus de la fleche
echo      - CLIC DROIT dessus  ^>  roue dentee  ^>  colle ta cle Gemini
echo  ============================================================
echo.
pause
exit /b 0

:echec
echo.
echo  ============================================================
echo    ECHEC - rien n'a ete modifie.
echo.
echo    Verifie que AionUi est bien ferme (barre des taches incluse),
echo    puis relance ce fichier.
echo.
echo    Si le probleme persiste, le detail est affiche plus haut.
echo  ============================================================
echo.
pause
exit /b 1
