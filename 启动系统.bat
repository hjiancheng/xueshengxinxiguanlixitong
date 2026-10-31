@echo off
title Student Information System
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install Node.js 22.5 or newer from https://nodejs.org then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run detected: installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your network and run this file again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting Student Information System...
echo   Open in browser: http://localhost:3000
echo   Login: admin / 123456   (teacher / 123456 for class-only view)
echo.
echo   Closing this window stops the server.
echo.

call npm start
echo.
echo Server stopped. Press any key to close.
pause >nul
