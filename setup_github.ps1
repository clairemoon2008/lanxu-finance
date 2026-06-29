param(
  [string]$RepoName = "lanxu-finance"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$git = "C:\Program Files\Git\bin\git.exe"
$gh = "C:\Program Files\GitHub CLI\gh.exe"

Write-Host "==> Lanxu Finance GitHub setup" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $git)) { throw "Git not found. Install Git for Windows first." }
if (-not (Test-Path $gh)) { throw "GitHub CLI not found. Install gh first." }

$loggedIn = $false
try {
  & $gh auth status *> $null
  $loggedIn = ($LASTEXITCODE -eq 0)
} catch {
  $loggedIn = $false
}
if (-not $loggedIn) {
  Write-Host "Please sign in to GitHub in the browser..." -ForegroundColor Yellow
  & $gh auth login -p https -w
}

if (-not (Test-Path ".git")) {
  & $git init
  & $git branch -M main
}

$env:GIT_AUTHOR_NAME = "Didimoon609"
$env:GIT_AUTHOR_EMAIL = "Didimoon609@gmail.com"
$env:GIT_COMMITTER_NAME = "Didimoon609"
$env:GIT_COMMITTER_EMAIL = "Didimoon609@gmail.com"

& $git add .
& $git diff --staged --quiet
if ($LASTEXITCODE -ne 0) {
  & $git commit -m "chore: lanxu finance site with daily automation"
}

Write-Host ""
Write-Host "==> Create GitHub repo and push..." -ForegroundColor Cyan
$user = (& $gh api user -q .login)
$fullRepo = "$user/$RepoName"
& $gh repo view $fullRepo 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create $RepoName --public --source=. --remote=origin --push
} else {
  & $git push -u origin main
}

Write-Host ""
Write-Host "==> Set GitHub Secrets..." -ForegroundColor Cyan
if (Test-Path ".env.deploy") {
  Get-Content ".env.deploy" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $name, $value = $_.Split('=', 2)
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    if ($name -in @('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'DEEPSEEK_API_KEY') -and $value) {
      $value | & $gh secret set $name --repo $fullRepo
      Write-Host "  Secret set: $name" -ForegroundColor Green
    }
  }
} else {
  Write-Host "  .env.deploy not found. Add secrets manually on GitHub." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host "  Repo: https://github.com/$fullRepo"
Write-Host "  Actions: https://github.com/$fullRepo/actions"
Write-Host ""
Write-Host "Confirm these GitHub Secrets exist:" -ForegroundColor Yellow
Write-Host "  DEEPSEEK_API_KEY"
Write-Host "  CLOUDFLARE_API_TOKEN"
Write-Host "  CLOUDFLARE_ACCOUNT_ID"
Write-Host ""
Write-Host "Then run Actions -> Daily Brief and Deploy -> Run workflow" -ForegroundColor Yellow
