@echo off
setlocal
title Roulette Dashboard Launcher v2026.07.25.7
set "BUILD=v2026.07.25.7"
set "DASHBOARD_DIR=%~dp0"

echo Roulette Live Dashboard %BUILD%
echo Folder: %DASHBOARD_DIR%
echo Stable local port: 8765
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DASHBOARD_DIR%dashboard-launcher.ps1" -DashboardRoot "%DASHBOARD_DIR%" -Build "%BUILD%" -Port 8765
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo ERROR: Dashboard launch failed with exit code %RESULT%.
  echo Review the precise error above. No unrelated process was stopped.
  echo.
  pause
  exit /b %RESULT%
)

echo Dashboard %BUILD% is healthy and ready.
echo You may close this launcher window.
pause
exit /b 0
