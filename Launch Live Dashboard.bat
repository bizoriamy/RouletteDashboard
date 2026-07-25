@echo off
setlocal
title Roulette Dashboard Launcher v2026.07.25.6
set "BUILD=v2026.07.25.6"
set "DIR=%~dp0"
set "ROULETTE_PORT=8765"
set "URL=http://localhost:%ROULETTE_PORT%/live-dashboard.html?build=2026.07.25.6"

echo Roulette Live Dashboard %BUILD%
echo Folder: %DIR%
echo Stable local port: %ROULETTE_PORT%
echo.

where python.exe >nul 2>&1
if not errorlevel 1 (
  set "PYTHON=python.exe"
) else (
  where py.exe >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Python could not be found.
    pause
    exit /b 1
  )
  set "PYTHON=py.exe -3"
)

start "Roulette Server %BUILD% - Port %ROULETTE_PORT%" /min %PYTHON% "%DIR%server.py"
timeout /t 2 /nobreak >nul

powershell.exe -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 5; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo ERROR: The local server did not start on stable port %ROULETTE_PORT%.
  echo Tell Codex: Launcher %BUILD% server start failed.
  pause
  exit /b 1
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "Roulette Live Dashboard %BUILD%" "%CHROME%" --app="%URL%" --window-size=650,1000
) else (
  start "" "%URL%"
)
endlocal
