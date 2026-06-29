# 岚序财经｜Lanxu Finance

面向香港、新加坡、阿联酋和海湾国家的经济政策新闻网站与日报生成系统。

## 当前版本包含

- 品牌展示网站
- `data/sources.json` 新闻源与关键词配置
- `scripts/build-daily.mjs` 自动抓取、去重、排序、生成日报
- `data/latest.json` 首页读取的数据
- `daily/YYYY-MM-DD.json` 归档数据
- `newsletters/YYYY-MM-DD.md` 公众号、邮件和 LinkedIn 可复用文稿
- `scripts/send-telegram.mjs` Telegram 分发脚本
- `scripts/send_email.py` 邮件分发脚本
- `docs/DEPLOYMENT.md` 部署和运营说明

## 本地预览

最简单的方式：

```powershell
.\open_site.bat
```

浏览器会打开：

```text
http://localhost:4173/
```

`localhost` 是本机预览地址，只给自己测试用。正式上线后建议使用 `lanxucaijing.com` 和 `lanxufinance.com`。

手动启动：

```bash
npm run dev
```

打开 `http://localhost:4173/`。

## 生成每日简报

```bash
python scripts/build_daily.py
```

正常情况下，终端会显示类似：

```text
岚序财经：开始生成今日简报...
正在抓取：香港
  获取候选：...
生成完成：
- 网站数据：data/latest.json
```

看到“生成完成”就代表网站已经更新。个别新闻源提示不可用不影响最终生成。

如果部署环境有 Node，也可以运行：

```bash
npm run build:daily
```

没有 AI key 时，系统会用规则生成摘要。你可以选择 DeepSeek 或 OpenAI。

DeepSeek：

```powershell
$env:AI_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
python scripts\build_daily.py
```

更简单的方式：运行脚本后按提示粘贴 DeepSeek API Key。

```powershell
.\run_deepseek.ps1
```

如果 PowerShell 提示禁止运行脚本，用批处理版：

```powershell
.\run_deepseek.bat
```

如果已经生成过日报，只想把现有标题和摘要翻译成中文，可以运行：

```powershell
$env:AI_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="你的 DeepSeek API key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
python scripts\build_daily.py --translate-latest
```

中文页面会优先显示 AI 生成的 `titleZh`、`summaryZh`、`impactZh`，同时保留英文原文标题。

OpenAI：

```powershell
$env:AI_PROVIDER="openai"
$env:OPENAI_API_KEY="你的 OpenAI API key"
$env:OPENAI_MODEL="gpt-5-mini"
python scripts\build_daily.py
```

默认脚本会跳过 GDELT，避免频繁 429 限流。如果你想测试 GDELT，可以临时打开：

```powershell
$env:LANXU_USE_GDELT="1"
python scripts\build_daily.py
```

## 环境变量

复制 `.env.example`，在部署平台里配置对应变量：

```bash
OPENAI_API_KEY=你的 OpenAI API key
OPENAI_MODEL=你希望使用的模型
TELEGRAM_BOT_TOKEN=Telegram bot token
TELEGRAM_CHAT_ID=Telegram channel 或 group id
```

## 推荐部署

第一阶段建议使用 Cloudflare Pages 或 Vercel 托管网站，用 GitHub Actions 每天定时运行 `npm run build:daily` 并提交生成结果。

第二阶段再接入 Supabase，保存历史新闻、用户订阅、收藏和关键词提醒。

第三阶段接入公众号、邮件、Telegram 和 LinkedIn 的自动分发。

更多细节见 `docs/DEPLOYMENT.md`。

域名接入见 `docs/DOMAIN_SETUP.md`。

Cloudflare 免费上线见 `docs/CLOUDFLARE_FREE.md`。
