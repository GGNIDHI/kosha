@echo off
title Kosha Launcher
cd /d "%~dp0"

echo Checking if server is already running on port 7673...
netstat -o -an | findstr :7673 >nul
if %errorlevel% neq 0 (
    echo Port 7673 is free. Starting Vite server...
    start /b cmd /c "npm run dev -- --port 7673"
    :: Give the Vite server 2 seconds to initialize
    timeout /t 2 >nul
) else (
    echo Server is already running.
)

echo Opening Kosha Dashboard in your browser...
start http://localhost:7673
exit
