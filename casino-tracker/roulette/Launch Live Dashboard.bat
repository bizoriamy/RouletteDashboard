@echo off
setlocal
set "DASHBOARD_DIR=%~dp0"
set "VERSION_FILE=%DASHBOARD_DIR%VERSION"

if not exist "%VERSION_FILE%" (
  echo ERROR: VERSION file not found:
  echo %VERSION_FILE%
  pause
  exit /b 20
)

set /p BUILD=<"%VERSION_FILE%"
if not defined BUILD (
  echo ERROR: VERSION file is empty.
  pause
  exit /b 21
)

title Roulette Dashboard Launcher %BUILD%

echo Roulette Live Dashboard %BUILD%
echo Folder: %DASHBOARD_DIR%
echo Stable local port: 8765
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%DASHBOARD_DIR%dashboard-launcher.ps1" -DashboardRoot "%DASHBOARD_DIR%." -Build "%BUILD%" -Port 8765
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
