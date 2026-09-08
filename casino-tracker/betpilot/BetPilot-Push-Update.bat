@echo off
REM BetPilot-myMates - Push updates to GitHub
REM Double-click this file to commit and push local changes.

cd /d "%~dp0"

echo ============================================
echo  BetPilot-myMates - Push Update to GitHub
echo ============================================
echo.

git status
echo.

set /p COMMIT_MSG="Enter commit message (or press Enter for default): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update BetPilot-myMates

echo.
echo Staging changes...
git add README.md docs frontend src

echo.
echo Committing...
git commit -m "%COMMIT_MSG%"

echo.
echo Pushing to origin/main...
git push origin main

echo.
echo ============================================
echo  Done. Press any key to close.
echo ============================================
pause >nul
