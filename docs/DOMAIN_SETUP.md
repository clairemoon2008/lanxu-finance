# 岚序财经域名接入清单

## 推荐域名

- 中文主站：`lanxucaijing.com`
- 英文入口：`lanxufinance.com`

第一阶段两个域名指向同一个网站。后续英文内容稳定后，再把 `lanxufinance.com` 拆成英文首页。

## 推荐托管

优先使用 Cloudflare Pages：

- 免费额度够用
- CDN 快
- 域名和 HTTPS 配置简单
- 后续能接定时任务

## 操作顺序

1. 注册域名：`lanxucaijing.com` 和 `lanxufinance.com`
2. 注册或登录 Cloudflare
3. 把两个域名添加到 Cloudflare
4. 按 Cloudflare 提示，把域名的 Nameserver 改到 Cloudflare
5. 在 Cloudflare Pages 创建项目
6. 上传或连接这个网站目录：`outputs/news-intel-site`
7. 在 Pages 的 Custom domains 里添加：
   - `lanxucaijing.com`
   - `www.lanxucaijing.com`
   - `lanxufinance.com`
   - `www.lanxufinance.com`
8. 等 Cloudflare 自动签发 HTTPS 证书

## 域名使用建议

中文传播使用：

```text
https://lanxucaijing.com
```

英文名片、LinkedIn 和海外用户使用：

```text
https://lanxufinance.com
```

第一阶段两个网址看到同一个网站。网站顶部已经有中文 / EN 切换，用户可以自己选择语言。

## 本地和正式地址区别

本地测试：

```text
http://localhost:4173/
```

正式上线：

```text
https://lanxucaijing.com
https://lanxufinance.com
```

不要把 `localhost` 或 `127.0.0.1` 发给别人，那只是你电脑里的测试地址。
