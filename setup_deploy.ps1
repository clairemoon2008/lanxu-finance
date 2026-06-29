param(
  [switch]$SkipGithub
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host ""
Write-Host "岚序财经 · 一键部署向导" -ForegroundColor Cyan
Write-Host "需要你的 Cloudflare 凭证（仅保存在本机 .env.deploy，不会上传）" -ForegroundColor DarkGray
Write-Host ""

$token = Read-Host "Cloudflare API Token"
$account = Read-Host "Cloudflare Account ID"

if (-not $token -or -not $account) {
  throw "Token 和 Account ID 不能为空"
}

$deepseek = Read-Host "DeepSeek API Key（可选，直接回车跳过）"
$githubRepo = Read-Host "GitHub 仓库名，如 username/lanxu-finance（可选，直接回车跳过）"

$lines = @(
  "CLOUDFLARE_API_TOKEN=$token",
  "CLOUDFLARE_ACCOUNT_ID=$account",
  "CF_PAGES_PROJECT=lanxu-finance",
  "CF_CUSTOM_DOMAINS=lanxucaijing.com,www.lanxucaijing.com"
)
if ($deepseek) { $lines += "DEEPSEEK_API_KEY=$deepseek" }
if ($githubRepo) { $lines += "GITHUB_REPO=$githubRepo" }

$lines | Set-Content -Path ".env.deploy" -Encoding UTF8
Write-Host "已写入 .env.deploy" -ForegroundColor Green

Write-Host ""
Write-Host "==> 部署到 Cloudflare Pages + 绑定域名" -ForegroundColor Cyan
python scripts/deploy_cloudflare.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipGithub -and $githubRepo) {
  $gh = "C:\Program Files\GitHub CLI\gh.exe"
  $git = "C:\Program Files\Git\bin\git.exe"
  if ((Test-Path $gh) -and (Test-Path $git)) {
    Write-Host ""
    Write-Host "==> GitHub 登录与推送" -ForegroundColor Cyan
    & $gh auth status 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "请在浏览器中完成 GitHub 登录…" -ForegroundColor Yellow
      & $gh auth login -p https -w
    }
    if (-not (Test-Path ".git")) {
      & $git init
      & $git branch -M main
    }
    & $git add .
    & $git commit -m "chore: lanxu finance site deploy" 2>$null
    & $gh repo create $githubRepo --public --source=. --remote=origin --push --confirm 2>$null
    if ($LASTEXITCODE -ne 0) {
      & $git push -u origin main 2>$null
    }
    if ($deepseek) {
      Write-Host "请在 GitHub 仓库 Settings → Secrets 添加 DEEPSEEK_API_KEY" -ForegroundColor Yellow
      Write-Host "以及 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 以启用每日自动更新" -ForegroundColor Yellow
    }
  }
}

Write-Host ""
Write-Host "完成！" -ForegroundColor Green
Write-Host "  预览: https://lanxu-finance.pages.dev"
Write-Host "  域名: https://lanxucaijing.com （DNS 需在 Cloudflare 托管该域名）"
Write-Host "  请 Ctrl+F5 强制刷新浏览器"
Write-Host ""
