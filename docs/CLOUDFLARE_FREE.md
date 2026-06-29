# Cloudflare Pages 免费上线步骤

## 你要准备

- 一个 Cloudflare 账号
- 这个网站文件夹：`outputs/news-intel-site`
- 推荐项目名：`lanxu-finance`

## 最简单上线方式：Direct Upload

1. 打开 Cloudflare：`https://dash.cloudflare.com`
2. 登录后进入 **Workers & Pages**
3. 点击 **Create application**
4. 选择 **Pages**
5. 选择 **Upload assets** 或 **Direct Upload**
6. Project name 填：

```text
lanxu-finance
```

7. 上传网站文件夹或 zip 包
8. 部署完成后，会得到一个免费地址，通常类似：

```text
https://lanxu-finance.pages.dev
```

这就是可以发给别人看的正式测试地址，比 `localhost` 和 `127.0.0.1` 正式得多。

## 上传哪些文件

直接上传整个 `news-intel-site` 文件夹即可。

至少需要包含：

- `index.html`
- `styles.css`
- `app.js`
- `data/latest.json`
- `daily/`
- `newsletters/`

`scripts/`、`docs/`、`.bat` 文件上传了也没关系，但它们主要是你本地维护用的。

## 每天更新内容

在你电脑本地运行：

```powershell
cd "C:\Users\Administrator\Documents\Codex\2026-06-21\new-chat-2\outputs\news-intel-site"
.\run_deepseek.bat
```

生成完成后，再把更新后的文件重新上传到 Cloudflare Pages。

后续如果你想自动化，可以再做 GitHub Actions，每天自动生成并部署。

## 免费地址和未来域名

第一阶段：

```text
https://lanxu-finance.pages.dev
```

未来买域名后：

```text
https://lanxucaijing.com
https://lanxufinance.com
```

Cloudflare Pages 可以直接绑定这两个域名。

## 注意

- 不要上传包含真实 API key 的文件。
- 当前项目没有把 API key 写进文件，DeepSeek key 只在你运行脚本的窗口里临时使用。
- 如果网页更新后没变化，浏览器按 `Ctrl + F5` 强制刷新。
