# 岚序财经部署与运营建议

## 推荐路径

建议同时注册并使用两个域名：

- `lanxucaijing.com`：中文主入口，适合公众号、中文社群和国内受众
- `lanxufinance.com`：英文/国际入口，适合 LinkedIn、海外客户和邮件名片

第一阶段可以让两个域名指向同一个网站；等英文内容稳定后，再把 `lanxufinance.com` 拆成英文版首页。

本地测试时使用 `http://localhost:4173/`。这只是开发预览地址，不是对外展示的网址。对外传播请使用正式域名。

第一阶段用静态网站托管即可：

1. Cloudflare Pages 或 Vercel 托管 `outputs/news-intel-site`
2. 每天定时运行 `python scripts/build_daily.py`
3. 把生成的 `data/latest.json`、`daily/*.json`、`newsletters/*.md` 发布到站点
4. 邮件或 Telegram 负责主动推送

第二阶段再接 Supabase：

- 存新闻原文、摘要、地区、主题、热度分
- 存订阅用户、关键词、推送偏好
- 支持搜索、收藏、会员权限

## 每日任务

```bash
python scripts/build_daily.py
```

默认任务会跳过 GDELT，避免公共接口频繁限流。需要测试 GDELT 时再设置：

```bash
LANXU_USE_GDELT=1 python scripts/build_daily.py
```

可选 AI 摘要：

```bash
set AI_PROVIDER=deepseek
set DEEPSEEK_API_KEY=你的 DeepSeek key
set DEEPSEEK_MODEL=deepseek-v4-flash
python scripts/build_daily.py
```

只翻译已经生成的最新版日报：

```bash
set AI_PROVIDER=deepseek
set DEEPSEEK_API_KEY=你的 DeepSeek key
set DEEPSEEK_MODEL=deepseek-v4-flash
python scripts/build_daily.py --translate-latest
```

如果使用 OpenAI，则改为：

```bash
set AI_PROVIDER=openai
set OPENAI_API_KEY=你的 OpenAI key
set OPENAI_MODEL=gpt-5-mini
python scripts/build_daily.py
```

## 分发

邮件：

```bash
python scripts/send_email.py
```

Telegram：

```bash
node scripts/send-telegram.mjs
```

公众号和 LinkedIn：

- 复制 `newsletters/YYYY-MM-DD.md`
- 公众号建议保留“今日重点 + 热点解读 + 原文链接”
- LinkedIn 建议只发 3 条重点英文摘要，并引导到网站全文

## 质量控制

当前系统已经包含：

- 最近 14 天过滤
- 地区关键词校验
- 可信来源加权
- 低质量来源屏蔽
- GDELT 限流时自动切换 Google News RSS
- 抓取失败时保留上一版，避免首页空白

下一步建议增加：

- 官方源白名单抓取器
- 去除 Google News 跳转链接，解析到原始媒体链接
- 人工审核后台
- 中文 AI 摘要质量评估
- 按地区设置不同权重
