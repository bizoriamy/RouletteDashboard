@echo off
setlocal EnableExtensions
title PawWork - One-way GitHub Sync

set "REPO=%~dp0"
set "SYNC_SCRIPT=%REPO%casino-tracker\roulette\github-sync.ps1"
set "VALIDATE_ARG="
if /I "%PAWWORK_SYNC_VALIDATE_ONLY%"=="1" set "VALIDATE_ARG=-ValidateOnly"

echo PawWork permanent one-way GitHub sync
echo Source: %REPO%
echo Destination: origin/local-sync only
echo SAFETY: No pull, branch switch, merge, rebase, reset, or push to main.
echo.

if not exist "%SYNC_SCRIPT%" (
  echo ERROR: Sync script was not found:
  echo %SYNC_SCRIPT%
  echo.
  pause
  exit /b 20
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SYNC_SCRIPT%" -Repository "%REPO%." %VALIDATE_ARG%
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo GitHub sync stopped safely with exit code %RESULT%.
  echo Read the precise error above. No pull or main-branch change was performed.
) else (
  echo GitHub sync completed and verified successfully.
)
echo.
pause
exit /b %RESULT%
