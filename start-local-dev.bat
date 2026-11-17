@echo off
title Kendin Tasarla - Isolated Local Development
echo ============================================================
echo   KENDIN TASARLA - UNIFIED ISOLATED LOCAL DEV RUNNER
echo ============================================================
echo Starting Firebase Emulators, Store (3000) and Admin (3001)...
cd /d "%~dp0"
node scripts\dev-isolated.mjs start
pause
