@echo off
rem Ouvre les statistiques Grand Paname dans le navigateur (lecture seule).
rem Laisse cette fenetre ouverte tant que tu les consultes ; ferme-la pour arreter.
cd /d "%~dp0"
title Stats Grand Paname
if not exist node_modules (
  echo Premiere utilisation : installation des composants...
  call npm install
)
node --env-file=..\app\.env stats-ui.js --ouvrir
pause
