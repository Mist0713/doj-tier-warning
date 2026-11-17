# After editing, run: .\publish-update.ps1 -Message 'Describe this update'
param(
    [ValidateSet('patch', 'minor', 'major')][string]$Bump = 'patch',
    [string]$Message = 'Update DOJ tier warning'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$dtwRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
function Invoke-DtwCommand {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed (exit $LASTEXITCODE)." }
}
if (-not (Test-Path -LiteralPath (Join-Path $dtwRoot '.git'))) { throw 'Run setup-github.ps1 first.' }
Push-Location -LiteralPath $dtwRoot
try {
    $dtwTop = (& git rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($dtwTop) -ne $dtwRoot) { throw 'Repository root does not match this script folder.' }
    if ((& git branch --show-current).Trim() -ne 'main') { throw 'Use the main branch before publishing.' }
    $dtwOrigin = & git remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $dtwOrigin -ne 'https://github.com/Mist0713/doj-tier-warning.git') { throw 'Unexpected GitHub remote.' }
    Invoke-DtwCommand 'git' @('fetch', 'origin', 'main')
    & git merge-base --is-ancestor origin/main HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Remote changes exist. Integrate origin/main before publishing.' }
    Invoke-DtwCommand 'node' @('--check', 'doj-tier-warning.user.js')
    Invoke-DtwCommand 'npm' @('test')
    Invoke-DtwCommand 'node' @('scripts/release.mjs', '--bump', $Bump)
    Invoke-DtwCommand 'npm' @('install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund')
    Invoke-DtwCommand 'npm' @('run', 'release:check')
    Invoke-DtwCommand 'git' @('add', '--', '.gitignore', 'README.md', 'package.json', 'package-lock.json', 'doj-tier-warning.user.js', 'doj-tier-warning.meta.js', 'setup-github.ps1', 'publish-update.ps1', 'scripts', 'test')
    Invoke-DtwCommand 'git' @('commit', '-m', $Message)
    Invoke-DtwCommand 'git' @('push', 'origin', 'main')
    Write-Host 'Published. Tampermonkey will detect the higher version on its next update check.'
} finally { Pop-Location }
