param(
  [string]$EnvFile = ".env.deploy"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "==> Lanxu Finance one-click deploy" -ForegroundColor Cyan

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $name, $value = $_.Split('=', 2)
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    if ($name -and $value) { Set-Item -Path "Env:$name" -Value $value }
  }
}

Write-Host "==> Building upload zip + deploying to Cloudflare Pages"
python scripts/deploy_cloudflare.py
if ($LASTEXITCODE -ne 0) {
  Write-Host "Cloudflare deploy needs credentials in .env.deploy" -ForegroundColor Yellow
  Write-Host "Copy .env.deploy.example -> .env.deploy and fill CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID"
  exit $LASTEXITCODE
}

$git = "C:\Program Files\Git\bin\git.exe"
$gh = "C:\Program Files\GitHub CLI\gh.exe"

if (-not (Test-Path $git)) {
  Write-Host "Git not installed yet. Cloudflare deploy finished; GitHub push skipped." -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Path ".git")) {
  & $git init
  & $git branch -M main
  & $git add .
  & $git commit -m "chore: initial lanxu finance site"
}

if ($env:GITHUB_TOKEN -and (Test-Path $gh)) {
  Write-Host "==> Pushing to GitHub"
  $repo = $env:GITHUB_REPO
  if (-not $repo) { throw "Set GITHUB_REPO in .env.deploy, e.g. username/lanxu-finance" }
  $remote = "https://$($env:GITHUB_TOKEN)@github.com/$repo.git"
  & $git remote remove origin 2>$null
  & $git remote add origin $remote
  & $git push -u origin main
  Write-Host "GitHub push complete: https://github.com/$repo"
} else {
  Write-Host "GitHub push skipped (set GITHUB_TOKEN + GITHUB_REPO in .env.deploy)." -ForegroundColor Yellow
}

Write-Host "Done. Open https://lanxucaijing.com (or https://lanxu-finance.pages.dev) and press Ctrl+F5." -ForegroundColor Green
