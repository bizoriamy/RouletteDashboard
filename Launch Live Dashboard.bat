@echo off
setlocal
set "DASHBOARD=file:///C:/Users/HP/Documents/Codex/2026-07-17/referenced-chatgpt-conversation-this-is-untrusted/outputs/roulette-analyzer/live-dashboard.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Google Chrome could not be found.
  pause
  exit /b 1
)
start "Roulette Live Dashboard" "%CHROME%" --app="%DASHBOARD%" --window-size=650,1000
endlocal
