param(
    [string]$DashboardRoot = $PSScriptRoot,
    [int]$Port = 8765,
    [int]$CheckSeconds = 15,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($DashboardRoot).TrimEnd('\')
$versionPath = Join-Path $root 'VERSION'
$launcherPath = Join-Path $root 'dashboard-launcher.ps1'
$healthUrl = "http://127.0.0.1:$Port/__roulette_health__"
$logPath = Join-Path $env:TEMP 'roulette-dashboard-keeper.log'
$sha256 = [Security.Cryptography.SHA256]::Create()
try { $hashBytes = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($root)) }
finally { $sha256.Dispose() }
$hashText = ([BitConverter]::ToString($hashBytes)).Replace('-', '')
$mutexName = 'Local\RouletteDashboardKeeper-' + $hashText.Substring(0, 20)
$created = $false
$mutex = New-Object Threading.Mutex($true, $mutexName, [ref]$created)
if (-not $created) { exit 0 }

function Write-KeeperLog([string]$Message) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding UTF8 -ErrorAction SilentlyContinue
}
function Get-Build {
    if (-not (Test-Path -LiteralPath $versionPath -PathType Leaf)) { return '' }
    return (Get-Content -LiteralPath $versionPath -Raw).Trim()
}
function Test-Dashboard {
    $build = Get-Build
    if (-not $build) { return $false }
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
        return ($health.ok -eq $true -and $health.app -eq 'RouletteDashboard' -and
            $health.build -eq $build -and
            [IO.Path]::GetFullPath([string]$health.root).TrimEnd('\') -ieq $root)
    } catch { return $false }
}
function Repair-Dashboard {
    if (Test-Dashboard) { return $true }
    if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
        Write-KeeperLog "Cannot recover: missing $launcherPath"
        return $false
    }
    $build = Get-Build
    Write-KeeperLog "Starting $build on port $Port."
    try {
        & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $launcherPath -DashboardRoot $root -Build $build -Port $Port -SkipBrowser | Out-Null
        if (Test-Dashboard) { Write-KeeperLog 'Recovery succeeded.'; return $true }
        Write-KeeperLog 'Recovery command finished but health verification failed.'
    } catch { Write-KeeperLog "Recovery failed: $($_.Exception.Message)" }
    return $false
}

try {
    if ($Once) { if (Repair-Dashboard) { exit 0 } else { exit 1 } }
    Write-KeeperLog "Keeper started for $root."
    while ($true) {
        [void](Repair-Dashboard)
        Start-Sleep -Seconds ([Math]::Max(5, $CheckSeconds))
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
