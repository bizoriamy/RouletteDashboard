@echo off
setlocal
set "DIR=%~dp0"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

:: Start local server (required for Google Sheets sync)
echo Starting local server on port 8080...
start "Roulette Server" /min python "%DIR%server.py"
timeout /t 2 /nobreak >nul

if not exist "%CHROME%" (
  echo Google Chrome could not be found.
  echo Open this URL manually: http://localhost:8080/live-dashboard.html
  pause
  exit /b 1
)
start "Roulette Live Dashboard" "%CHROME%" --app="http://localhost:8080/live-dashboard.html" --window-size=650,1000
endlocal
