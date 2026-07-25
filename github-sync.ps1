param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath($Repository).TrimEnd('\')
$expectedRemote = 'https://github.com/bizoriamy/RouletteDashboard.git'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'

function Fail([string]$Message, [int]$Code) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit $Code
}

function Git([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments) {
    $output = & git -C $repo @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
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
    $root = (Git rev-parse --show-toplevel | Select-Object -Last 1).Trim()
    if ([IO.Path]::GetFullPath($root).TrimEnd('\') -ine $repo) { Fail "Git root '$root' does not match '$repo'." 22 }

    $branch = (Git branch --show-current | Select-Object -Last 1).Trim()
    if ($branch -cne 'local-sync') { Fail "Current branch is '$branch'. Switch to local-sync manually; this launcher will not switch or alter branches." 23 }

    $remote = (Git remote get-url origin | Select-Object -Last 1).Trim()
    $normalizedRemote = $remote.TrimEnd('/').Replace('git@github.com:', 'https://github.com/')
    if ($normalizedRemote -ine $expectedRemote) { Fail "origin is '$remote', not '$expectedRemote'." 24 }

    Write-Host 'Checking GitHub authentication and origin/local-sync (no pull)...'
    $remoteResult = GitRemote @('ls-remote', '--exit-code', 'origin', 'refs/heads/local-sync')
    if ($remoteResult.ExitCode -ne 0) { Fail "Could not authenticate or read origin/local-sync:`n$($remoteResult.Output -join [Environment]::NewLine)" 25 }
    $remoteHash = (($remoteResult.Output | Select-Object -Last 1) -split '\s+')[0]

    if ($ValidateOnly) {
        $localHash = (Git rev-parse HEAD | Select-Object -Last 1).Trim()
        $changes = @(Git status --short)
        if ($changes.Count -eq 0) {
            Write-Host 'Validation passed: no local changes.'
        } else {
            Write-Host "Validation passed: $($changes.Count) local status line(s) would be considered for commit."
        }
        if ($localHash -eq $remoteHash) {
            Write-Host "Validation passed: origin/local-sync is up to date at $localHash."
        } else {
            Write-Host "Validation passed: local $localHash differs from origin/local-sync $remoteHash; no commit or push was attempted."
        }
        exit 0
    }

    Git add --all -- . | Out-Null
    $staged = @(Git diff --cached --name-only)
    if ($staged.Count -gt 0) {
        Write-Host "Committing $($staged.Count) changed path(s) to local-sync..."
        $message = 'Sync PawWork local changes ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        Git commit -m $message | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host 'No local changes to commit.'
    }

    $localHash = (Git rev-parse HEAD | Select-Object -Last 1).Trim()
    if ($localHash -eq $remoteHash) {
        Write-Host "origin/local-sync is up to date at $localHash."
        exit 0
    }

    # Refuse non-fast-forward or unrelated updates; never pull, merge, or reset.
    & git -C $repo merge-base --is-ancestor $remoteHash $localHash
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
