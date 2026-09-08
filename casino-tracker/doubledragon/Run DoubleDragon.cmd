@echo off
setlocal
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Google Chrome was not found. Install Chrome, then run this launcher again.
  pause
  exit /b 1
)
start "DoubleDragon" "%CHROME%" --app="file:///%~dp0index.html" --user-data-dir="%~dp0.chrome-profile-v3" --no-first-run --no-default-browser-check