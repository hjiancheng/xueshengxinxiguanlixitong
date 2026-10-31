@echo off
title Reset Demo Data
cd /d "%~dp0"

rem Guard: the database file is locked while the server is running.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] The server is still running on port 3000.
  echo Close the server window first, then run this file again.
  pause
  exit /b 1
)

echo This will delete school.db and regenerate demo data
echo (3 departments / 10 classes / 200 students / 1200 scores).
echo Your own records will be lost.
echo.
set /p confirm=Type Y and press Enter to continue: 
if /i not "%confirm%"=="Y" (
  echo Cancelled. Nothing changed.
  pause
  exit /b 0
)

if exist school.db del /q school.db
if exist school.db-wal del /q school.db-wal
if exist school.db-shm del /q school.db-shm

call npm run seed
echo.
echo Done. Double-click the start batch file to launch again.
pause
