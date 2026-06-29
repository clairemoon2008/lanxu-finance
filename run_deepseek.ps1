$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "岚序财经｜DeepSeek 自动生成日报" -ForegroundColor Cyan
Write-Host "请在下面粘贴你的 DeepSeek API Key。输入时不会显示明文，这是正常的。" -ForegroundColor Yellow
Write-Host ""

$secureKey = Read-Host "DeepSeek API Key" -AsSecureString
$plainKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
)

if ([string]::IsNullOrWhiteSpace($plainKey)) {
  Write-Host "没有输入 API Key，已取消。" -ForegroundColor Red
  exit 1
}

$env:AI_PROVIDER = "deepseek"
$env:DEEPSEEK_API_KEY = $plainKey
$env:DEEPSEEK_MODEL = "deepseek-v4-flash"
$env:LANXU_USE_GDELT = ""

Write-Host ""
Write-Host "开始生成日报，请稍等..." -ForegroundColor Cyan
python scripts\build_daily.py

Write-Host ""
Write-Host "完成后打开或刷新网页：" -ForegroundColor Green
Write-Host "http://127.0.0.1:4173/" -ForegroundColor Green
Write-Host ""
Write-Host "提示：如果网页已经打开，请按 Ctrl + F5 强制刷新。" -ForegroundColor Yellow
