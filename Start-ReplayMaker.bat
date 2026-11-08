@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TRPGReplayMaker - Portable Windows (no Docker)
echo ===========================================
echo   TRPGReplayMaker - Windows Portable
echo ===========================================
echo.
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" (
  set "NODE_EXE=%~dp0runtime\node.exe"
) else (
  where node >nul 2>&1
  if errorlevel 1 goto :missingNode
  set "NODE_EXE=node"
)
"%NODE_EXE%" -e "process.exit(parseInt(process.versions.node,10)>=24?0:1)" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 24 or newer is required.
  echo Download the Windows ZIP from the user manual, or install Node.js 24.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installing application dependencies for the first source checkout...
  where npm >nul 2>&1
  if errorlevel 1 goto :missingNpm
  call npm ci --omit=dev
  if errorlevel 1 goto :installError
)
if not exist "web\dist\index.html" (
  echo Building browser dashboard for the first source checkout...
  where npm >nul 2>&1
  if errorlevel 1 goto :missingNpm
  call npm --prefix web ci
  if errorlevel 1 goto :installError
  call npm --prefix web run build
  if errorlevel 1 goto :installError
)
set "DATA_DIR=%~dp0user-data"
set "PARLEY_ENV_FILE=%DATA_DIR%\.env"
set "TRPG_PORTABLE_MODE=1"
set "WEB_UI_HOST=127.0.0.1"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if errorlevel 1 goto :dataError
if not exist "%PARLEY_ENV_FILE%" (
  if exist ".env" (
    copy /Y ".env" "%PARLEY_ENV_FILE%" >nul
  ) else (
    if not exist ".env.example" goto :dataError
    copy /Y ".env.example" "%PARLEY_ENV_FILE%" >nul
  )
  if errorlevel 1 goto :dataError
)
echo.
echo Data: %DATA_DIR%
echo Local dashboard: http://127.0.0.1:3000
echo.
echo OpenAI transcription needs an API key and explicit setup under Settings.
echo Optional local Whisper needs Python 3.11: Setup-Local-Whisper.bat
echo.
echo Keep this window open while recording.
echo To stop, press Ctrl+C in this window.
echo.
start "" "http://127.0.0.1:3000"
"%NODE_EXE%" "src\index.js"
set "RESULT=%ERRORLEVEL%"
echo.
echo TRPGReplayMaker exited (code %RESULT%).
if not "%RESULT%"=="0" pause
exit /b %RESULT%

:missingNode
echo [ERROR] Node.js was not found.
echo Download the Windows ZIP from the user manual.
echo Or install Node.js 24 and use this GitHub source archive.
pause
exit /b 1

:missingNpm
echo [ERROR] npm was not found. Source checkouts require Node.js with npm.
echo The prebuilt Portable ZIP already contains the dependencies.
pause
exit /b 1

:installError
echo [ERROR] Could not install/build dependencies. Check Internet access and npm logs.
pause
exit /b 1

:dataError
echo [ERROR] Could not create the user-data directory or local settings.
echo Unpack the ZIP to a writable folder, not Program Files.
pause
exit /b 1
