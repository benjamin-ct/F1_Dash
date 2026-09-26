@echo off
chcp 65001 >nul
title F1 Dash
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe. Telechargez la version LTS sur https://nodejs.org puis relancez ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances...
  call npm install --omit=dev
)

start "" http://localhost:3000
node server\index.js
pause
