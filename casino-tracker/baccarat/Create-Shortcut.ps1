# ============================================
# Create Desktop Shortcut for Baccarat Tracker
# Run this once to create a shortcut on desktop
# ============================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Baccarat Tracker.lnk"

# Create WScript.Shell object
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)

# Set shortcut properties
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptDir\Launch.ps1`""
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Baccarat Tracker - Clean Mode"
$Shortcut.IconLocation = "shell32.dll,24"

# Save the shortcut
$Shortcut.Save()

Write-Host ""
Write-Host "Desktop shortcut created!" -ForegroundColor Green
Write-Host "Location: $ShortcutPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now double-click 'Baccarat Tracker' on your desktop to launch." -ForegroundColor Yellow
Write-Host ""
