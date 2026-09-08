# ============================================
# Baccarat Tracker - Clean Launcher (Always on Top)
# Opens Chrome in app mode with always-on-top
# ============================================

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_SHOWWINDOW = 0x0040;
}
"@

# Get the folder where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Build the full path to index.html
$IndexPath = Join-Path $ScriptDir "index.html"

# Convert to file:// URL (use forward slashes)
$FileUrl = "file:///" + $IndexPath.Replace('\', '/')

# Window settings
$WindowWidth = 380
$WindowHeight = 700
$WindowX = 10
$WindowY = 100

# Chrome app mode launch
$ChromeArgs = "--app=`"$FileUrl`" --window-size=$WindowWidth,$WindowHeight --window-pos=$WindowX,$WindowY"

# Find Chrome executable
$ChromePaths = @(
    "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
)

$ChromeExe = $null
foreach ($path in $ChromePaths) {
    if (Test-Path $path) {
        $ChromeExe = $path
        break
    }
}

if (-not $ChromeExe) {
    Write-Host "Chrome not found! Please install Google Chrome." -ForegroundColor Red
    pause
    exit
}

# Launch Chrome
$Process = Start-Process -FilePath $ChromeExe -ArgumentList $ChromeArgs -PassThru

# Wait for Chrome to fully launch
Start-Sleep -Seconds 2

# Set window as always on top
try {
    $MainWindowHandle = $Process.MainWindowHandle
    if ($MainWindowHandle -ne [IntPtr]::Zero) {
        [WinAPI]::SetWindowPos($MainWindowHandle, [WinAPI]::HWND_TOPMOST, 0, 0, 0, 0, [WinAPI]::SWP_NOMOVE -bor [WinAPI]::SWP_NOSIZE -bor [WinAPI]::SWP_SHOWWINDOW)
    }
} catch {}

Write-Host ""
Write-Host "Baccarat Tracker launched (Always on Top!)" -ForegroundColor Green
Write-Host ""
