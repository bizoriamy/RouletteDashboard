@echo off
setlocal EnableExtensions
title Roulette Dashboard - One-way GitHub Sync

set "REPO=%~dp0"
set "EXPECTED_REMOTE=https://github.com/bizoriamy/RouletteDashboard.git"
set "STAGE=initial validation"

echo PawWork one-way GitHub sync
echo Source of truth: %REPO%
echo Destination: origin/dev only
echo SAFETY: This launcher never pulls, switches branches, merges, resets, or changes main.
echo.

where git.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git was not found in PATH.
  goto :failed
)

if not exist "%REPO%.git" (
  echo ERROR: Git repository not found at:
  echo %REPO%
  goto :failed
)

cd /d "%REPO%"
if errorlevel 1 (
  echo ERROR: Could not open repository folder.
  goto :failed
)

set "STAGE=repository verification"
for /f "delims=" %%G in ('git rev-parse --show-toplevel 2^>nul') do set "GIT_ROOT=%%G"
if not defined GIT_ROOT (
  echo ERROR: Git could not verify this repository.
  goto :failed
)
for %%G in ("%GIT_ROOT%") do set "GIT_ROOT=%%~fG"
for %%G in ("%REPO%.") do set "EXPECTED_ROOT=%%~fG"
if /I not "%GIT_ROOT%"=="%EXPECTED_ROOT%" (
  echo ERROR: Git root is "%GIT_ROOT%", expected "%EXPECTED_ROOT%".
  goto :failed
)

set "STAGE=branch verification"
for /f "delims=" %%G in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%G"
if not "%CURRENT_BRANCH%"=="dev" (
  echo ERROR: Current branch is "%CURRENT_BRANCH%".
  echo Switch to dev manually. This launcher will not switch branches.
  goto :failed
)
echo Verified branch: dev

set "STAGE=remote verification"
for /f "delims=" %%G in ('git remote get-url origin 2^>nul') do set "ACTUAL_REMOTE=%%G"
if not defined ACTUAL_REMOTE (
  echo ERROR: Git remote "origin" is not configured.
  goto :failed
)
if /I not "%ACTUAL_REMOTE%"=="%EXPECTED_REMOTE%" (
  echo ERROR: origin is "%ACTUAL_REMOTE%".
  echo Expected: "%EXPECTED_REMOTE%"
  goto :failed
)
echo Verified remote: %ACTUAL_REMOTE%

if /I "%ROULETTE_SYNC_VALIDATE_ONLY%"=="1" (
  echo Validation-only test passed. No stage, commit, or push was attempted.
  exit /b 0
)

set "STAGE=staging local changes"
git add --all -- . ":(exclude)backup-before-*" ":(exclude)backup-before-*/**" ":(exclude)**/__pycache__/**" ":(exclude)**/*.pyc" ":(exclude)**/*.log" ":(exclude)**/*.tmp" ":(exclude)**/*.temp"
if errorlevel 1 goto :failed

git diff --cached --quiet
if not errorlevel 1 (
  echo No local changes to commit.
  goto :push
)

set "STAGE=commit"
echo Committing local PawWork changes to dev...
git commit -m "Sync PawWork local changes %date% %time%"
if errorlevel 1 goto :failed

:push
set "STAGE=push to origin/dev"
echo Checking and pushing origin/dev...
git push origin HEAD:refs/heads/dev
if errorlevel 1 goto :failed

set "LOCAL_HEAD="
set "TRACKING_HEAD="
for /f "delims=" %%G in ('git rev-parse HEAD 2^>nul') do set "LOCAL_HEAD=%%G"
for /f "delims=" %%G in ('git rev-parse origin/dev 2^>nul') do set "TRACKING_HEAD=%%G"
if not defined LOCAL_HEAD (
  echo ERROR: Could not verify local HEAD after push.
  goto :failed
)
if /I not "%LOCAL_HEAD%"=="%TRACKING_HEAD%" (
  echo ERROR: Local HEAD and origin/dev tracking state do not match after push.
  goto :failed
)

echo.
echo SUCCESS: origin/dev is up to date at:
echo %LOCAL_HEAD%
echo No pull was performed. Main was not changed or pushed.
echo.
pause
exit /b 0

:failed
echo.
echo ERROR: Sync stopped during %STAGE%.
echo No pull, merge, reset, branch switch, or main-branch push was performed.
echo Review the Git error shown above.
echo.
pause
exit /b 1
