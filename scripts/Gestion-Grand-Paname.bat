@echo off
rem Ouvre l'outil de gestion Grand Paname (statistiques + notifications) dans le navigateur.
rem Laisse cette fenetre ouverte tant que tu l'utilises ; ferme-la pour arreter.
cd /d "%~dp0"
title Gestion Grand Paname
if not exist node_modules (
  echo Premiere utilisation : installation des composants...
  call npm install
)
node --env-file=..\app\.env gestion-ui.js --ouvrir
pause
