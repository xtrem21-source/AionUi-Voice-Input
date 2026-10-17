@echo off
setlocal
title AiTron Voice Input - Installation pour AionUi
cd /d "%~dp0"

echo.
echo  ============================================================
echo    AiTron Voice Input  -  bouton micro pour AionUi
echo  ============================================================
echo.
echo    Tu n'as PAS besoin de fermer AionUi :
echo    s'il tourne encore, il sera ferme de force dans 3 secondes
echo    (Ctrl+C pour annuler). C'est necessaire, Windows verrouille
echo    l'archive tant que l'application est ouverte.
echo.
echo    Ce script va :
echo      1. fermer AionUi s'il est encore ouvert
echo      2. sauvegarder resources\app.asar  -^>  app.asar.bak
echo      3. ajouter le bouton micro
echo      4. recompresser l'archive
echo.
echo    Un journal (.log) est ecrit dans le dossier logs.
echo    En cas de probleme, c'est ce fichier qu'il faut transmettre.
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
echo.
echo    Journal : dossier "logs" (fichier patch-AionUi-*.log)
echo  ============================================================
echo.
pause
exit /b 0

:echec
echo.
echo  ============================================================
echo    ECHEC - rien n'a ete modifie.
echo.
echo    Si AionUi refuse de se fermer : ouvre le gestionnaire de
echo    taches, termine "AionUi" (toutes les lignes), relance ceci.
echo.
echo    Le detail exact est dans le dossier "logs"
echo    (fichier patch-AionUi-*.log) : transmet-le pour diagnostic.
echo  ============================================================
echo.
pause
exit /b 1
