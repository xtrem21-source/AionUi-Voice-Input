@echo off
title AiTron Voice Input - AionUi
echo.
echo  ======================================================
echo    AiTron Voice Input  -  installation pour AionUi
echo  ======================================================
echo.
echo    Double-clique, puis FERME AionUi (Fichier ^> Quitter).
echo    Le reste est automatique : sauvegarde, correctif, relance.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\patch-when-closed.ps1"
echo.
pause
