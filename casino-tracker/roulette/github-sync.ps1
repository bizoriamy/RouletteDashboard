param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($Repository).TrimEnd('\')
$expectedRemote = 'https://github.com/bizoriamy/RouletteDashboard.git'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$env:GIT_CONFIG_COUNT = '1'
$env:GIT_CONFIG_KEY_0 = 'safe.directory'
$env:GIT_CONFIG_VALUE_0 = $repo

function Fail([string]$Message, [int]$Code) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit $Code
}

function Invoke-LocalGit([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments) {
    # Git writes ordinary warnings to stderr — a line-ending conversion notice, for one. With
    # $ErrorActionPreference = 'Stop' at the top of this script, that warning becomes a terminating
    # error even though the command succeeded. Relax the preference around the call and judge the
    # command by its exit code, which is what actually signals failure.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git.exe -C $repo @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "git $($Arguments -join ' ') failed:`n$($output -join [Environment]::NewLine)"
    }
    return @($output)
}

function GitRemote([string[]]$Arguments, [int]$TimeoutSeconds = 30) {
    function Quote-ProcessArgument([string]$Value) {
        if ($Value -notmatch '[\s"]') { return $Value }
        return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
    }
    $allArguments = @('-C', $repo) + $Arguments
    $argumentLine = ($allArguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' '
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'git.exe'
    $startInfo.Arguments = $argumentLine
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw 'GitHub operation could not start.' }
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            $process.Kill()
            throw "GitHub operation timed out after $TimeoutSeconds seconds."
        }
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $output = @(($stdout + $stderr) -split '\r?\n' | Where-Object { $_ -ne '' })
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $output }
    } finally {
        $process.Dispose()
    }
}

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { Fail 'Git was not found in PATH.' 20 }
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { Fail "'$repo' is not a Git repository." 21 }

try {
    $root = (Invoke-LocalGit rev-parse --show-toplevel | Select-Object -Last 1).Trim()
    if ([IO.Path]::GetFullPath($root).TrimEnd('\') -ine $repo) { Fail "Git root '$root' does not match '$repo'." 22 }

    $branch = (Invoke-LocalGit branch --show-current | Select-Object -Last 1).Trim()
    if ($branch -cne 'dev') { Fail "Current branch is '$branch'. Switch to dev manually; this launcher will not switch or alter branches." 23 }

    $remote = (Invoke-LocalGit remote get-url origin | Select-Object -Last 1).Trim()
    $normalizedRemote = $remote.TrimEnd('/').Replace('git@github.com:', 'https://github.com/')
    if ($normalizedRemote -ine $expectedRemote) { Fail "origin is '$remote', not '$expectedRemote'." 24 }

    if ($ValidateOnly) {
        $localHash = (Invoke-LocalGit rev-parse HEAD | Select-Object -Last 1).Trim()
        $changes = @(Invoke-LocalGit status --short)
        if ($changes.Count -eq 0) {
            Write-Host 'Validation passed: no local changes.'
        } else {
            Write-Host "Validation passed: $($changes.Count) local status line(s) would be considered for commit."
        }
        Write-Host 'Validation passed: destination is origin/local-sync; no network, commit, or push was attempted.'
        exit 0
    }

    Write-Host 'Checking GitHub authentication and origin/local-sync (no pull)...'
    $remoteResult = GitRemote @('ls-remote', '--exit-code', 'origin', 'refs/heads/local-sync')
    if ($remoteResult.ExitCode -ne 0) { Fail "Could not authenticate or read origin/local-sync:`n$($remoteResult.Output -join [Environment]::NewLine)" 25 }
    $remoteHash = (($remoteResult.Output | Select-Object -Last 1) -split '\s+')[0]

    # Synchronize the active Roulette/OCR project and its repository-level
    # documentation, plus the BetPilot Baccarat module. Unrelated PawWork
    # experiments remain untouched.
    $syncPaths = @(
        '.gitignore',
        'README.md',
        'Sync PawWork to GitHub.bat',
        'BetPilot',
        'casino-tracker/roulette',
        'OCR'
    )
    Invoke-LocalGit add --all -- @syncPaths | Out-Null
    $staged = @(Invoke-LocalGit diff --cached --name-only)

    # Images and PDFs are how personal material leaks into a PUBLIC repository. On 2026-09-28 a GitHub
    # billing receipt (email address, transaction id, card last four) was saved as a screenshot into
    # BetPilot\SOURCE\OCR\ and synced automatically. Only the project's own assets may travel; keep
    # private pictures under BetPilot\BACARAT\data\, which is never synced.
    $permittedImages = @(
        'casino-tracker/roulette/live-dashboard-icon.png',
        'casino-tracker/roulette/test_sample.jpeg',
        'experiments/roulette-bank-chart.png',
        'experiments/roulette-pl-chart.png'
    )
    $stagedImages = @($staged | Where-Object {
        $_ -match '\.(png|jpe?g|gif|bmp|webp|tiff?|pdf|heic|svg)$' -and $permittedImages -notcontains $_
    })
    if ($stagedImages.Count -gt 0) {
        Fail ("Image or PDF files were staged for sync:`n" + ($stagedImages -join [Environment]::NewLine) +
              "`n`nScreenshots and captures belong under BetPilot\BACARAT\data\ (never synced). If one of these is a" +
              "`ngenuine project asset, add its exact repo-relative path to `$permittedImages in" +
              "`ncasino-tracker\roulette\github-sync.ps1.") 32
    }

    $forbidden = @($staged | Where-Object {
        $_ -match '(^|/)(\.secrets|backup-before-[^/]*|__pycache__|\.pending)(/|$)' -or
        $_ -match '\.(pyc|log|tmp|temp)$' -or
        $_ -match '^casino-tracker/roulette/data/ocr-(events\.jsonl|corrections/)' -or
        # BetPilot: never commit personal session data, runtime state, or a key file.
        $_ -match '^BetPilot/BACARAT/(data|\.runtime)(/|$)' -or
        $_ -match '(^|/)ocr\.env$'
    })
    if ($forbidden.Count -gt 0) {
        Fail "Protected runtime or private paths were staged unexpectedly:`n$($forbidden -join [Environment]::NewLine)" 31
    }
    if ($staged.Count -gt 0) {
        Write-Host "Committing $($staged.Count) changed path(s) to dev..."
        $message = 'Sync PawWork local changes ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        Invoke-LocalGit commit -m $message | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host 'No local changes to commit.'
    }

    $localHash = (Invoke-LocalGit rev-parse HEAD | Select-Object -Last 1).Trim()
    if ($localHash -eq $remoteHash) {
        Write-Host "origin/local-sync is up to date at $localHash."
        exit 0
    }

    # Refuse non-fast-forward or unrelated updates; never pull, merge, or reset.
    & git.exe -C $repo merge-base --is-ancestor $remoteHash $localHash
    if ($LASTEXITCODE -ne 0) {
        Fail 'origin/local-sync is not an ancestor of local HEAD. Push refused; reconcile manually without involving main.' 26
    }

    Write-Host 'Pushing local HEAD to origin/local-sync only...'
    $push = GitRemote @('push', 'origin', 'HEAD:refs/heads/local-sync') 120
    if ($push.ExitCode -ne 0) { Fail "Push failed:`n$($push.Output -join [Environment]::NewLine)" 27 }
    $push.Output | ForEach-Object { Write-Host $_ }

    $confirmed = GitRemote @('ls-remote', '--exit-code', 'origin', 'refs/heads/local-sync')
    if ($confirmed.ExitCode -ne 0) { Fail 'Push returned success, but final remote verification failed.' 28 }
    $confirmedHash = (($confirmed.Output | Select-Object -Last 1) -split '\s+')[0]
    if ($confirmedHash -ne $localHash) { Fail "Remote verification mismatch: local $localHash, remote $confirmedHash." 29 }
    Write-Host "Confirmed origin/local-sync is up to date at $localHash."
    exit 0
} catch {
    Fail $_.Exception.Message 30
}
