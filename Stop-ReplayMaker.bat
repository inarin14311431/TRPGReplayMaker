@echo off
setlocal
cd /d "%~dp0"
title TRPGReplayMaker - Stop instructions
echo To stop the portable app safely, press Ctrl+C in its Start-ReplayMaker.bat window.
echo The SQLite database and recordings remain in user-data.
echo.
echo If you previously started the Docker version, use Stop-ReplayMaker-Docker.bat.
pause
