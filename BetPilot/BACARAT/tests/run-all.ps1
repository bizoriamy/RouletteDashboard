# BetPilot Baccarat — run every check.
#
#   powershell -ExecutionPolicy Bypass -File tests\run-all.ps1
#
# Exit code 0 means: the engine is correct, the browser and server rules agree, the HTTP surface
# behaves (including every action it must REFUSE), and no credential-shaped string is in the module.

$ErrorActionPreference = 'Continue'
$testsDir = [IO.Path]::GetFullPath($PSScriptRoot)
$moduleRoot = [IO.Path]::GetFullPath((Join-Path $testsDir '..'))
$results = @()

function Invoke-Step([string]$Name, [scriptblock]$Body) {
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    & $Body
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    $script:results += [pscustomobject]@{ Name = $Name; Exit = $code }
    if ($code -ne 0) { Write-Host "  -> exit $code" -ForegroundColor Red }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: node was not found in PATH.' -ForegroundColor Red
    exit 2
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: python was not found in PATH.' -ForegroundColor Red
    exit 2
}

Invoke-Step 'Engine unit tests (node)' { node (Join-Path $testsDir 'engine.test.js') }
Invoke-Step 'Generate settlement vectors (node)' { node (Join-Path $testsDir 'generate-vectors.js') }
Invoke-Step 'Browser/server settlement agreement (python)' { python (Join-Path $testsDir 'settlement_test.py') }
Invoke-Step 'UI wiring: ids, handlers, classes (python)' { python (Join-Path $testsDir 'ui_wiring_test.py') }
Invoke-Step 'OCR logic and mode semantics (python)' { python (Join-Path $testsDir 'ocr_test.py') }
Invoke-Step 'Region locator: finding the table on screen (python)' { python (Join-Path $testsDir 'locate_region_test.py') }
Invoke-Step 'End-to-end server behaviour (python)' { python (Join-Path $testsDir 'server_smoke.py') }

Write-Host ""
Write-Host "=== Module hygiene ===" -ForegroundColor Cyan
# Only real-secret shapes count: a key prefix followed by 24+ key characters. Documentation that
# mentions DEEPSEEK_API_KEY=your-key-here, or a redacted sk-… , is not a leak.
$offenders = @()
$patterns = @(
    'sk-[A-Za-z0-9]{24,}',
    'AIza[A-Za-z0-9_\-]{24,}',
    '(DEEPSEEK|GEMINI)_API_KEY\s*=\s*[A-Za-z0-9_\-]{24,}'
)
Get-ChildItem -Path $moduleRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\data\\' -and $_.FullName -notmatch '\\\.runtime\\' } |
    ForEach-Object {
        $file = $_
        foreach ($pattern in $patterns) {
            $hits = Select-String -LiteralPath $file.FullName -Pattern $pattern -AllMatches -ErrorAction SilentlyContinue
            foreach ($hit in $hits) {
                if ($hit.Line -match 'your-|already set|never printed|paste from|<set|\.\.\.') { continue }
                $offenders += "$($file.FullName):$($hit.LineNumber)"
            }
        }
    }
if ($offenders.Count -gt 0) {
    Write-Host "  FAIL credential-shaped strings found:" -ForegroundColor Red
    $offenders | ForEach-Object { Write-Host "    $_" }
    $results += [pscustomobject]@{ Name = 'Module hygiene'; Exit = 1 }
} else {
    Write-Host "  ok   no credential-shaped strings in the module"
    $results += [pscustomobject]@{ Name = 'Module hygiene'; Exit = 0 }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$results | ForEach-Object {
    $colour = if ($_.Exit -eq 0) { 'Green' } else { 'Red' }
    Write-Host ("  {0,-52} {1}" -f $_.Name, $(if ($_.Exit -eq 0) { 'PASS' } else { "FAIL ($($_.Exit))" })) -ForegroundColor $colour
}
$failed = @($results | Where-Object { $_.Exit -ne 0 })
Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "$($failed.Count) step(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host 'All checks passed.' -ForegroundColor Green
exit 0
