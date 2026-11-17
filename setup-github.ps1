# Connect this folder to the existing GitHub repository without replacing local files.
# Run from PowerShell: .\setup-github.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$dtwRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$dtwRemote = 'https://github.com/Mist0713/doj-tier-warning.git'
function Invoke-DtwCommand {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
}
foreach ($dtwProgram in 'git', 'node', 'npm') {
    if (-not (Get-Command $dtwProgram -ErrorAction SilentlyContinue)) { throw "Install $dtwProgram first." }
}
Push-Location -LiteralPath $dtwRoot
try {
    $dtwHasOwnGit = Test-Path -LiteralPath (Join-Path $dtwRoot '.git')
    if (-not $dtwHasOwnGit) {
        # The parent n0thing repository is not used.
        Invoke-DtwCommand 'git' @('init', '-b', 'main', $dtwRoot)
    }
    $dtwTop = (& git rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($dtwTop) -ne $dtwRoot) {
        throw 'Repository root does not match this script folder.'
    }
    $dtwOrigin = & git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) { $dtwOrigin = '' }
    if ($dtwOrigin -and $dtwOrigin -ne $dtwRemote) { throw "Existing origin differs: $dtwOrigin" }
    if (-not $dtwOrigin) { Invoke-DtwCommand 'git' @('remote', 'add', 'origin', $dtwRemote) }
    Invoke-DtwCommand 'git' @('fetch', 'origin', 'main')
    & git rev-parse --verify HEAD 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        # Only an unborn repository is initialized this way; working files are left intact.
        Invoke-DtwCommand 'git' @('reset', '--mixed', 'origin/main')
    }
    if ((& git branch --show-current).Trim() -ne 'main') { throw 'Use the main branch before publishing.' }
    Invoke-DtwCommand 'git' @('branch', '--set-upstream-to=origin/main', 'main')
    Invoke-DtwCommand 'npm' @('install', '--ignore-scripts', '--no-audit', '--no-fund')
    Invoke-DtwCommand 'npm' @('test')
    Invoke-DtwCommand 'npm' @('run', 'release:check')
    Write-Host 'Connected. Local files were preserved. Review git status before publishing.'
    Write-Host 'Repository: https://github.com/Mist0713/doj-tier-warning'
} finally { Pop-Location }
