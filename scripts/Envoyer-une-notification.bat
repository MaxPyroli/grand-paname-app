@echo off
rem Ouvre l'outil d'envoi de notifications Grand Paname dans le navigateur.
rem Laisse cette fenetre ouverte tant que tu l'utilises ; ferme-la pour arreter.
cd /d "%~dp0"
title Notifications Grand Paname
if not exist node_modules (
  echo Premiere utilisation : installation des composants...
  call npm install
)
node notifications-ui.js --ouvrir
pause
