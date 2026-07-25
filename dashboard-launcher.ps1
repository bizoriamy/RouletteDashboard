param(
    [Parameter(Mandatory = $true)][string]$DashboardRoot,
    [Parameter(Mandatory = $true)][string]$Build,
    [int]$Port = 8765,
    [switch]$SkipBrowser
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($DashboardRoot).TrimEnd('\')
$serverPath = [IO.Path]::GetFullPath((Join-Path $root 'server.py'))
$dashboardPath = Join-Path $root 'live-dashboard.html'
$healthUrl = "http://127.0.0.1:$Port/__roulette_health__"
$dashboardUrl = "http://localhost:$Port/live-dashboard.html"
$expectedTitle = "*<title>Roulette Live Dashboard * $Build</title>*"

function Fail([string]$Message, [int]$Code) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit $Code
}

function Get-Health {
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($response.ok -eq $true -and
            $response.app -eq 'RouletteDashboard' -and
            $response.build -eq $Build -and
            [IO.Path]::GetFullPath([string]$response.root).TrimEnd('\') -ieq $root -and
            [IO.Path]::GetFullPath([string]$response.server) -ieq $serverPath) {
            return $response
        }
    } catch {}
    return $null
}

function Test-Dashboard([object]$Health) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri $dashboardUrl -TimeoutSec 4
        return ($page.StatusCode -eq 200 -and
                $page.Content -like $expectedTitle -and
                $page.Content -like "*class=`"build-version`">$Build</small>*")
    } catch {
        return $false
    }
}

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
    Fail "Missing server.py at '$serverPath'." 10
}
if (-not (Test-Path -LiteralPath $dashboardPath -PathType Leaf)) {
    Fail "Missing live-dashboard.html at '$dashboardPath'." 11
}

$healthy = Get-Health
if ($healthy -and (Test-Dashboard $healthy)) {
    Write-Host "Reusing healthy dashboard server PID $($healthy.pid)."
} else {
    # Only select Python processes whose command line names this exact server.py.
    try {
        $quotedServer = [regex]::Escape($serverPath)
        $stale = @(Get-CimInstance Win32_Process | Where-Object {
            $_.Name -in @('python.exe', 'pythonw.exe', 'py.exe') -and
            $_.CommandLine -match "(?i)(?:`"|\s|^)$quotedServer(?:`"|\s|$)"
        })
    } catch {
        Fail "Windows denied process command-line inspection. Cannot safely identify this dashboard's stale servers: $($_.Exception.Message)" 12
    }

    foreach ($process in $stale) {
        Write-Host "Stopping stale dashboard server PID $($process.ProcessId)..."
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            Wait-Process -Id $process.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
        } catch {
            Fail "Could not stop stale dashboard server PID $($process.ProcessId): $($_.Exception.Message)" 13
        }
    }

    $portOwner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($portOwner) {
        $owners = ($portOwner | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
        Fail "Stable port $Port is occupied by unverified PID(s): $owners. Refusing to stop unrelated processes." 14
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

    $logPath = Join-Path $env:TEMP 'roulette-dashboard-server.log'
    $errorLogPath = Join-Path $env:TEMP 'roulette-dashboard-server-error.log'
    Write-Host "Starting exactly one dashboard server..."
    try {
        $env:ROULETTE_PORT = [string]$Port
        $started = Start-Process -FilePath $python.Source -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errorLogPath -PassThru
    } catch {
        Fail "Could not start Python: $($_.Exception.Message)" 16
    }

    $healthy = $null
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        $healthy = Get-Health
        if ($healthy -and (Test-Dashboard $healthy)) { break }
        if ($started.HasExited) {
            $details = @(
                if (Test-Path $logPath) { Get-Content $logPath -Raw -ErrorAction SilentlyContinue }
                if (Test-Path $errorLogPath) { Get-Content $errorLogPath -Raw -ErrorAction SilentlyContinue }
            ) -join [Environment]::NewLine
            Fail "Server exited with code $($started.ExitCode). $details" 17
        }
    }
    if (-not $healthy -or -not (Test-Dashboard $healthy)) {
        if (-not $started.HasExited) { Stop-Process -Id $started.Id -Force -ErrorAction SilentlyContinue }
        Fail "Server did not return this exact dashboard and build on port $Port within 5 seconds." 18
    }
    Write-Host "Started healthy dashboard server PID $($healthy.pid)."
}

if ($SkipBrowser) {
    Write-Host 'Browser opening skipped for automated validation.'
    exit 0
}

$chromeCandidates = @()
if ($env:ProgramFiles) {
    $chromeCandidates += Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
}
if (${env:ProgramFiles(x86)}) {
    $chromeCandidates += Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
}
if ($env:LOCALAPPDATA) {
    $chromeCandidates += Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'
}
$chromeCandidates = @($chromeCandidates | Where-Object {
    Test-Path -LiteralPath $_ -PathType Leaf
})

try {
    if ($chromeCandidates.Count -gt 0) {
        Start-Process -FilePath $chromeCandidates[0] -ArgumentList @("--app=$dashboardUrl", '--window-size=650,1000')
        Write-Host 'Opened in Google Chrome.'
    } else {
        Start-Process $dashboardUrl
        Write-Host 'Google Chrome was unavailable; opened the system default browser.'
    }
} catch {
    Fail "Dashboard is healthy, but the browser could not be opened: $($_.Exception.Message)" 19
}
exit 0
