@echo off
setlocal
cd /d "%~dp0"
title TRPGReplayMaker - Stop
where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker not found.
  pause
  exit /b 1
)
docker compose stop
if errorlevel 1 (
  echo [ERROR] Could not stop the application.
  pause
  exit /b 1
)
echo Application stopped. Recordings and database volumes were not deleted.
pause
