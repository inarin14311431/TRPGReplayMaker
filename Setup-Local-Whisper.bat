@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TRPGReplayMaker - Optional Local Whisper Setup
echo Optional local faster-whisper setup (no Docker).
echo This downloads Python dependencies and models. CPU processing can be slow.
echo.
if not exist "stt_sidecar\server.py" (
  echo [ERROR] stt_sidecar is missing. Download the full package.
  pause
  exit /b 1
)
where py >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python launcher is not installed.
  echo Install Python 3.11 from https://www.python.org/downloads/
  pause
  exit /b 1
)
py -3.11 -c "import sys; print(sys.version)"
if errorlevel 1 (
  echo [ERROR] Python 3.11 is required for this optional setup.
  pause
  exit /b 1
)
if not exist "stt_sidecar\.venv\Scripts\python.exe" (
  py -3.11 -m venv "stt_sidecar\.venv"
  if errorlevel 1 goto :fail
)
"stt_sidecar\.venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :fail
"stt_sidecar\.venv\Scripts\python.exe" -m pip install -r "stt_sidecar\requirements-windows.txt"
if errorlevel 1 goto :fail
echo.
echo Local Whisper installed. Restart TRPGReplayMaker.
echo In Settings, choose Local sidecar (faster-whisper) for transcription.
echo Local transcription runs on your CPU, with no STT API charge.
pause
exit /b 0
:fail
echo [ERROR] Python setup failed. Review output above.
pause
exit /b 1
