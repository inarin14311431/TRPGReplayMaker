@echo off
setlocal
cd /d "%~dp0"
title TRPGReplayMaker - Easy Start
echo ==============================================
echo   TRPGReplayMaker - Windows Quick Start
echo ==============================================
echo.
where docker >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker Desktop is not installed.
  echo Download: https://docs.docker.com/desktop/setup/install/windows-install/
  echo After installation, open Docker Desktop and retry this file.
  pause
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker Desktop is not running.
  echo Start Docker Desktop, then double-click this file again.
  pause
  exit /b 1
)
docker compose version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker Compose is not available.
  pause
  exit /b 1
)
if not exist ".env" (
  if not exist ".env.example" (
    echo [ERROR] Missing .env.example. Extract the entire ZIP first.
    pause
    exit /b 1
  )
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 (
    echo [ERROR] Could not create local .env config.
    pause
    exit /b 1
  )
  echo Created local configuration.
)
echo.
echo Building and starting the local app...
echo The first launch may download Docker images and Whisper models.
docker compose up --build -d
if errorlevel 1 (
  echo.
  echo [ERROR] Startup failed. Check Docker Desktop and the log above.
  echo You can also run: docker compose logs --tail 80
  pause
  exit /b 1
)
echo.
echo Startup requested. Opening local dashboard...
echo http://127.0.0.1:3000
start "" "http://127.0.0.1:3000"
echo.
echo If the page is not ready, try refreshing it after the containers start.
echo Local recordings remain on this PC in Docker volumes.
echo To stop the app, run Stop-ReplayMaker.bat.
pause
