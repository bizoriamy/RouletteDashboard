param(
    [Parameter(Mandatory = $true)][string]$ModuleRoot,
    [Parameter(Mandatory = $true)][string]$Build,
    [int]$Port = 8766,
    [switch]$SkipBrowser,
    [switch]$NoTopmost
)

# BetPilot Baccarat launcher.
# Mirrors casino-tracker/roulette/dashboard-launcher.ps1: verify before reusing, never stop an
# unverified process, and prove the exact page and build are being served before opening a window.

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ModuleRoot).TrimEnd('\')
$appRoot = Join-Path $root 'app'
$serverPath = [IO.Path]::GetFullPath((Join-Path $appRoot 'server.py'))
$pagePath = Join-Path $appRoot 'web\index.html'
$runtimeDir = Join-Path $root '.runtime'
$healthUrl = "http://127.0.0.1:$Port/__baccarat_health__"
$pageUrl = "http://localhost:$Port/?build=$([uri]::EscapeDataString($Build))"
$topmostUrl = "http://127.0.0.1:$Port/api/window/topmost"
$expectedTitle = "*<title>BetPilot Baccarat * $Build</title>*"

function Fail([string]$Message, [int]$Code) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit $Code
}

function Get-Health {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($response.ok -eq $true -and
            $response.app -eq 'BetPilotBaccarat' -and
            $response.build -eq $Build -and
            [IO.Path]::GetFullPath([string]$response.server).TrimEnd('\') -ieq $serverPath) {
            return $response
        }
    } catch {}
    return $null
}

function Test-Page([object]$Health) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri $pageUrl -TimeoutSec 4
        return ($page.StatusCode -eq 200 -and
                $page.Content -like $expectedTitle -and
                $page.Content -like "*$Build*")
    } catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
    Fail "Missing server.py at '$serverPath'." 10
}
if (-not (Test-Path -LiteralPath $pagePath -PathType Leaf)) {
    Fail "Missing app\web\index.html at '$pagePath'." 11
}

$healthy = Get-Health
if ($healthy -and (Test-Page $healthy)) {
    Write-Host "Reusing healthy Baccarat server PID $($healthy.pid)."
} else {
    try {
        $quotedServer = [regex]::Escape($serverPath)
        $stale = @(Get-CimInstance Win32_Process | Where-Object {
            $_.Name -in @('python.exe', 'pythonw.exe', 'py.exe') -and
            $_.CommandLine -match "(?i)(?:`"|\s|^)$quotedServer(?:`"|\s|$)"
        })
    } catch {
        Write-Host "Warning: Windows denied process command-line inspection, so stale server cleanup was skipped: $($_.Exception.Message)" -ForegroundColor Yellow
        $stale = @()
    }

    foreach ($process in $stale) {
        Write-Host "Stopping stale Baccarat server PID $($process.ProcessId)..."
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Wait-Process -Id $process.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
        } catch {
            Fail "Could not stop stale server PID $($process.ProcessId): $($_.Exception.Message)" 13
        }
    }

    $portOwner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($portOwner) {
        $owners = ($portOwner | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
        Fail "Port $Port is occupied by unverified PID(s): $owners. Refusing to stop unrelated processes." 14
    }

    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $arguments = @('-u', $serverPath)
    if (-not $python) {
        $python = Get-Command py.exe -ErrorAction SilentlyContinue
        $arguments = @('-3', '-u', $serverPath)
    }
    if (-not $python) {
        Fail 'Python 3 was not found in PATH.' 15
    }

    if (-not (Test-Path -LiteralPath $runtimeDir -PathType Container)) {
        New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
    }
    $logPath = Join-Path $runtimeDir 'baccarat-server.log'
    $errorLogPath = Join-Path $runtimeDir 'baccarat-server-error.log'
    Write-Host "Starting exactly one Baccarat server..."
    try {
        $env:BACCARAT_PORT = [string]$Port
        $started = Start-Process -FilePath $python.Source -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -PassThru
    } catch {
        Fail "Could not start Python: $($_.Exception.Message)" 16
    }

    $healthy = $null
    # The server imports the OCR stack before it opens its socket (about 5 seconds on a cold start),
    # so allow 12 seconds before calling it a failure.
    for ($attempt = 1; $attempt -le 48; $attempt++) {
        Start-Sleep -Milliseconds 250
        $healthy = Get-Health
        if ($healthy -and (Test-Page $healthy)) { break }
        if ($started.HasExited) {
            $details = @(
                if (Test-Path $logPath) { Get-Content $logPath -Raw -ErrorAction SilentlyContinue }
                if (Test-Path $errorLogPath) { Get-Content $errorLogPath -Raw -ErrorAction SilentlyContinue }
            ) -join [Environment]::NewLine
            Fail "Server exited with code $($started.ExitCode). $details" 17
        }
    }
    if (-not $healthy -or -not (Test-Page $healthy)) {
        if (-not $started.HasExited) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
        Fail "The server did not return this exact page and build on port $Port within 12 seconds." 18
    }
    Write-Host "Started healthy Baccarat server PID $($healthy.pid)."
}

if ($SkipBrowser) {
    Write-Host 'Browser opening skipped.'
    exit 0
}

$chromeCandidates = @()
if ($env:ProgramFiles) { $chromeCandidates += Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe' }
if (${env:ProgramFiles(x86)}) { $chromeCandidates += Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }
if ($env:LOCALAPPDATA) { $chromeCandidates += Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe' }
$chromeCandidates = @($chromeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })

try {
    if ($chromeCandidates.Count -gt 0) {
        Start-Process -FilePath $chromeCandidates[0] -ArgumentList @("--app=$pageUrl", '--window-size=1040,820')
        Write-Host 'Opened the Baccarat module in Google Chrome (app window).'
    } else {
        Start-Process $pageUrl
        Write-Host 'Google Chrome was unavailable; opened the system default browser.'
    }
} catch {
    Fail "The server is healthy, but the browser could not be opened: $($_.Exception.Message)" 19
}

if (-not $NoTopmost) {
    # The whole point of a side-by-side assistant: keep it above the casino window. Chrome ignores
    # window.open's alwaysOnTop, so this sets it through the Win32 API from the local server.
    Start-Sleep -Milliseconds 1800
    try {
        $result = Invoke-RestMethod -Method Post -Uri $topmostUrl -ContentType 'application/json' -Body '{"target":"table","enabled":true}' -TimeoutSec 4
        if ($result.matchedWindows -gt 0) {
            Write-Host "Always-on-top enabled for $($result.matchedWindows) Baccarat window(s)."
        } else {
            Write-Host "No Baccarat window matched for always-on-top yet; use the 'Always on top' button in the module." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Could not enable always-on-top automatically: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

exit 0
