param(
  [string]$RepoName = "lanxu-finance"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$git = "C:\Program Files\Git\bin\git.exe"
$gh = "C:\Program Files\GitHub CLI\gh.exe"

Write-Host "==> 岚序财经 GitHub 自动更新设置" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $git)) { throw "未安装 Git，请先安装 Git for Windows" }
if (-not (Test-Path $gh)) { throw "未安装 GitHub CLI，请先安装 gh" }

& $gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "请先登录 GitHub（会打开浏览器）..." -ForegroundColor Yellow
  & $gh auth login -p https -w
}

if (-not (Test-Path ".git")) {
  & $git init
  & $git branch -M main
}

& $git add .
& $git diff --staged --quiet
if ($LASTEXITCODE -ne 0) {
  & $git commit -m "chore: lanxu finance site with daily automation"
}

Write-Host ""
Write-Host "==> 创建 GitHub 仓库并推送..." -ForegroundColor Cyan
$user = (& $gh api user -q .login)
$fullRepo = "$user/$RepoName"
& $gh repo view $fullRepo 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create $RepoName --public --source=. --remote=origin --push
} else {
  & $git push -u origin main
}

Write-Host ""
Write-Host "==> 写入 GitHub Secrets..." -ForegroundColor Cyan
if (Test-Path ".env.deploy") {
  Get-Content ".env.deploy" | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $name, $value = $_.Split('=', 2)
    $name = $name.Trim()
    $value = $value.Trim().Trim('"').Trim("'")
    if ($name -in @('CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','DEEPSEEK_API_KEY') -and $value) {
      $value | & $gh secret set $name --repo $fullRepo
      Write-Host "  已设置 Secret: $name" -ForegroundColor Green
    }
  }
} else {
  Write-Host "  未找到 .env.deploy，请手动在 GitHub 设置 Secrets：" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "完成！" -ForegroundColor Green
Write-Host "  仓库: https://github.com/$fullRepo"
Write-Host "  Actions: https://github.com/$fullRepo/actions"
Write-Host ""
Write-Host "请在 GitHub → Settings → Secrets → Actions 确认以下 3 个 Secret 已设置：" -ForegroundColor Yellow
Write-Host "  - DEEPSEEK_API_KEY"
Write-Host "  - CLOUDFLARE_API_TOKEN"
Write-Host "  - CLOUDFLARE_ACCOUNT_ID"
Write-Host ""
Write-Host "设置完成后，在 Actions 页点击 Daily Brief and Deploy → Run workflow 可手动测试。" -ForegroundColor Yellow
