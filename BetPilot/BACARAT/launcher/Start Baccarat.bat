@echo off
setlocal EnableExtensions
title BetPilot - Baccarat

set "ROOT=%~dp0.."
for /f "usebackq delims=" %%v in ("%ROOT%\VERSION") do set "BUILD=%%v"

echo BetPilot Baccarat %BUILD%
echo Starting the local server and opening the module...
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0baccarat-launcher.ps1" -ModuleRoot "%ROOT%" -Build "%BUILD%" %*
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo The launcher stopped with exit code %RESULT%. Read the error above.
) else (
  echo Ready. The module stays above your casino window unless you turn that off.
)
pause
exit /b %RESULT%
