@echo off
setlocal
title Sync PawWork to GitHub - local-sync only
set "REPO=%~dp0"

echo PawWork one-way GitHub sync
echo Source of truth: %REPO%
echo Destination: origin/local-sync only
echo SAFETY: This launcher never pulls and never changes or pushes main.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%REPO%github-sync.ps1" -Repository "%REPO%"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo ERROR: Sync failed with exit code %RESULT%.
  echo No pull, merge, reset, or main-branch push was performed.
) else (
  echo Sync completed successfully for origin/local-sync.
)
echo.
pause
exit /b %RESULT%
