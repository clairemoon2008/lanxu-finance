import email.utils
import html
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from time import sleep

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ARCHIVE_DIR = ROOT / "daily"
NEWSLETTER_DIR = ROOT / "newsletters"
TODAY = datetime.now(timezone.utc).date().isoformat()


def main():
    if "--translate-latest" in sys.argv:
        translate_latest()
        return

    print("岚序财经：开始生成今日简报...")
    sources = read_json(DATA_DIR / "sources.json")
    articles = collect_articles(sources)
    ranked = rank_and_dedupe(articles, sources)[:24]
    print(f"筛选完成：候选新闻 {len(articles)} 条，入选 {len(ranked)} 条。")
    brief = build_brief(ranked, sources)

    brief = finalize_brief(brief, sources)

    ARCHIVE_DIR.mkdir(exist_ok=True)
    NEWSLETTER_DIR.mkdir(exist_ok=True)
    write_json(DATA_DIR / "latest.json", brief)
    write_json(ARCHIVE_DIR / f"{TODAY}.json", brief)
    (NEWSLETTER_DIR / f"{TODAY}.md").write_text(render_newsletter(brief), encoding="utf-8")
    rebuild_archive_index()
    write_feed(brief)
    print("生成完成：")
    print(f"- 网站数据：data/latest.json")
    print(f"- 日报归档：daily/{TODAY}.json")
    print(f"- 分发文稿：newsletters/{TODAY}.md")
    print(f"- 状态：{brief.get('status', 'unknown')}")


def translate_latest():
    if not ai_enabled():
        raise SystemExit("请先设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY，再运行翻译。")
    latest_path = DATA_DIR / "latest.json"
    if not latest_path.exists():
        raise SystemExit("找不到 data/latest.json，请先运行 python scripts\\build_daily.py。")
    brief = read_json(latest_path)
    articles = [
        {
            "title": story.get("originalTitle") or story.get("title", ""),
            "description": story.get("originalSummary") or story.get("summary", ""),
            "region": story.get("region", ""),
            "topic": story.get("topic", ""),
            "source": story.get("source", ""),
            "url": story.get("url", ""),
            "publishedAt": story.get("publishedAt", ""),
            "score": story.get("score", 0),
        }
        for story in brief.get("topStories", [])
    ]
    sources = read_json(DATA_DIR / "sources.json")
    translated = build_with_ai(articles, sources)
    translated = finalize_brief(translated, sources)
    write_json(latest_path, translated)
    write_json(ARCHIVE_DIR / f"{TODAY}.json", translated)
    NEWSLETTER_DIR.mkdir(exist_ok=True)
    (NEWSLETTER_DIR / f"{TODAY}.md").write_text(render_newsletter(translated), encoding="utf-8")
    rebuild_archive_index()
    write_feed(translated)
    print("翻译完成：中文页面会显示 AI 翻译后的标题和摘要。")


def collect_articles(sources):
    articles = []
    use_gdelt = os.getenv("LANXU_USE_GDELT") == "1"
    for region in sources["regions"]:
        print(f"正在抓取：{region['name']}")
        if region.get("queries"):
            region_articles = []
            if use_gdelt:
                combined_query = " OR ".join(f"({query})" for query in region["queries"])
                region_articles = fetch_gdelt(combined_query, region["name"])
            if not region_articles:
                for query in region["queries"]:
                    region_articles.extend(fetch_google_news(f"{query} when:14d", region["name"]))
                    sleep(0.5)
            articles.extend(region_articles)
            if region_articles:
                print(f"  获取候选：{len(region_articles)} 条")
            else:
                print("  本地区暂无候选，继续下一地区。")
        for feed_url in region.get("rss", []):
            articles.extend(fetch_rss(feed_url, region["name"]))
    return articles


def fetch_gdelt(query, region):
    params = urllib.parse.urlencode(
        {
            "query": query,
            "mode": "ArtList",
            "format": "json",
            "maxrecords": "20",
            "sort": "HybridRel",
            "timespan": "14d",
        }
    )
    url = f"https://api.gdeltproject.org/api/v2/doc/doc?{params}"
    try:
        payload = json.loads(fetch_text(url))
        return [
            {
                "title": clean(item.get("title", "")),
                "region": region,
                "source": item.get("sourceCountry") or domain_name(item.get("url", "")),
                "url": item.get("url", ""),
                "publishedAt": item.get("seendate") or now_iso(),
                "description": clean(item.get("title", "")),
            }
            for item in payload.get("articles", [])
        ]
    except Exception as exc:
        print(f"  提示：GDELT 暂不可用，已切换备用源。{region}: {short_error(exc)}")
        return []


def fetch_rss(feed_url, region, report=True):
    try:
        xml = fetch_text(feed_url)
        return [{**item, "region": region, "source": domain_name(item["url"] or feed_url)} for item in parse_rss(xml)]
    except Exception as exc:
        if report:
            print(f"  提示：RSS 源暂不可用，已跳过。{region}: {short_error(exc)}")
        return []


def fetch_google_news(query, region):
    params = urllib.parse.urlencode(
        {
            "q": query,
            "hl": "en-US",
            "gl": "US",
            "ceid": "US:en",
        }
    )
    url = f"https://news.google.com/rss/search?{params}"
    try:
        items = fetch_rss(url, region, report=False)
        return [normalize_google_news_item(item) for item in items]
    except Exception as exc:
        print(f"  提示：Google News 备用源暂不可用，已跳过。{region}: {short_error(exc)}")
        return []


def fetch_text(url):
    request = urllib.request.Request(url, headers={"User-Agent": "LanxuFinance/0.1"})
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=20, context=context) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_rss(xml):
    blocks = re.findall(r"<item[\s\S]*?</item>", xml, flags=re.I)[:20]
    items = []
    for block in blocks:
        items.append(
            {
                "title": clean(tag(block, "title")),
                "url": clean(tag(block, "link")),
                "publishedAt": parse_date(clean(tag(block, "pubDate"))) or now_iso(),
                "description": clean(strip_html(tag(block, "description"))),
            }
        )
    return items


def rank_and_dedupe(articles, sources):
    seen = set()
    ranked = []
    region_rules = {region["name"]: region.get("requiredTerms", []) for region in sources.get("regions", [])}
    keywords = sources.get("hotKeywords", [])
    trusted_domains = sources.get("trustedDomains", [])
    blocked_domains = sources.get("blockedDomains", [])
    for article in articles:
        if not article.get("title") or not article.get("url"):
            continue
        if not is_recent(article.get("publishedAt")):
            continue
        if is_blocked(article, blocked_domains):
            continue
        if not region_matches(article, region_rules.get(article.get("region"), [])):
            continue
        text = f"{article.get('title', '')} {article.get('description', '')}".lower()
        keyword_score = sum(10 for keyword in keywords if keyword.lower() in text)
        source_score = source_quality_score(article, trusted_domains)
        article["topic"] = infer_topic(text)
        article["score"] = min(99, 35 + keyword_score + source_score + (8 if article.get("publishedAt") else 0))
        key = normalize_key(article["url"] or article["title"])
        if key in seen:
            continue
        seen.add(key)
        ranked.append(article)
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def build_brief(articles, sources):
    if ai_enabled() and articles:
        try:
            return build_with_ai(articles, sources)
        except Exception as exc:
            print(f"AI 摘要暂未成功，已使用规则摘要继续生成：{format_openai_error(exc)}")

    top_stories = [
        {
            "title": make_chinese_title(article),
            "titleZh": make_chinese_title(article),
            "originalTitle": article["title"],
            "region": article["region"],
            "topic": article["topic"],
            "source": article["source"],
            "url": article["url"],
            "publishedAt": article["publishedAt"],
            "summary": rule_summary(article),
            "summaryZh": rule_summary(article),
            "originalSummary": article.get("description") or "",
            "impact": rule_impact(article),
            "impactZh": rule_impact(article),
            "score": article["score"],
        }
        for article in balanced_articles(articles, sources["regions"], 8)
    ]

    if not top_stories:
        previous = load_previous_brief()
        if previous and previous.get("topStories"):
            previous["status"] = "stale-cache"
            previous["summary"] = "今日抓取未成功，首页暂时保留上一版日报。请稍后重试或检查新闻源限流情况。"
            previous["generatedAt"] = now_iso()
            return previous
        return sample_brief(sources)

    return {
        "date": TODAY,
        "generatedAt": now_iso(),
        "status": "rule-generated" if articles else "empty",
        "headline": top_stories[0]["titleZh"] if top_stories else "今日暂无可用新闻",
        "summary": "系统已完成抓取、去重和热度排序。配置 OpenAI API key 后，将自动生成更完整的中文摘要和热点解读。"
        if top_stories
        else "没有抓取到新闻。请检查网络、新闻源或 API 配置。",
        "metrics": {
            "articles": len(articles),
            "regions": len(sources["regions"]),
            "hotspots": min(3, len(top_stories)),
        },
        "topStories": top_stories,
        "regions": [
            {
                "name": region["name"],
                "items": [
                    story["title"]
                    for story in top_stories
                    if story["region"] == region["name"]
                ][:4],
            }
            for region in sources["regions"]
        ],
        "analysis": build_rule_analysis(top_stories),
    }


def ai_enabled():
    return bool(os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY"))


def build_with_ai(articles, sources):
    provider = os.getenv("AI_PROVIDER", "").strip().lower()
    if not provider:
        provider = "deepseek" if os.getenv("DEEPSEEK_API_KEY") else "openai"
    if provider == "deepseek":
        return build_with_deepseek(articles, sources)
    return build_with_openai(articles, sources)


def brief_prompt(articles, sources):
    return (
        "你是面向跨境投资、贸易、金融和政策研究人群的双语经济情报编辑。"
        "请基于新闻列表生成严格 JSON，不要 Markdown，不要代码块。"
        "字段必须包括 date, generatedAt, status, headline, summary, metrics, topStories, regions, analysis。"
        "topStories 每条必须包含 title, titleZh, originalTitle, region, topic, source, url, publishedAt, summary, summaryZh, originalSummary, impact, impactZh, score。"
        "analysis 每条包含 label, title, body。"
        "重要规则：title 和 titleZh 必须是自然、准确、可读的中文标题，不要直接保留英文；originalTitle 保存原始英文标题。"
        "summary 和 summaryZh 必须是中文摘要；originalSummary 保存原始摘要或原始标题。"
        "impact 和 impactZh 必须是中文影响解读。analysis 也必须是中文。"
        "请保留原文链接，不要编造事实，不要添加新闻列表之外的信息。\n\n"
        f"日期：{TODAY}\n地区：{'、'.join(region['name'] for region in sources['regions'])}\n"
        f"新闻：{json.dumps(articles[:18], ensure_ascii=False)}"
    )


def build_with_deepseek(articles, sources):
    model = os.getenv("DEEPSEEK_MODEL") or "deepseek-v4-flash"
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": "You are a precise bilingual economic intelligence editor. Return valid JSON only."},
                {"role": "user", "content": brief_prompt(articles, sources)},
            ],
            "stream": False,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ['DEEPSEEK_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek HTTP {exc.code}: {body}") from exc

    text = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    parsed = normalize_ai_brief(parse_json_text(text), articles)
    return {"date": TODAY, "generatedAt": now_iso(), "status": "deepseek-generated", **parsed}


def build_with_openai(articles, sources):
    model = os.getenv("OPENAI_MODEL") or "gpt-5-mini"
    prompt = (
        brief_prompt(articles, sources)
    )
    body = json.dumps(
        {
            "model": model,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}]}],
            "text": {"format": {"type": "json_object"}},
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI HTTP {exc.code}: {body}") from exc
    text = payload.get("output_text")
    if not text:
        for item in payload.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    break
    parsed = normalize_ai_brief(parse_json_text(text), articles)
    return {"date": TODAY, "generatedAt": now_iso(), "status": "ai-generated", **parsed}


def parse_json_text(text):
    value = str(text or "").strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?", "", value, flags=re.I).strip()
        value = re.sub(r"```$", "", value).strip()
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", value)
        if match:
            return json.loads(match.group(0))
        raise


def normalize_ai_brief(brief, source_articles):
    source_by_url = {article.get("url"): article for article in source_articles}
    for story in brief.get("topStories", []):
        source = source_by_url.get(story.get("url"), {})
        original_title = story.get("originalTitle") or source.get("title") or story.get("title", "")
        original_summary = story.get("originalSummary") or source.get("description") or original_title
        story["originalTitle"] = original_title
        story["originalSummary"] = original_summary
        story["titleZh"] = story.get("titleZh") or story.get("title") or make_chinese_title({**source, **story})
        story["title"] = story["titleZh"]
        story["summaryZh"] = story.get("summaryZh") or story.get("summary") or rule_summary({**source, **story})
        story["summary"] = story["summaryZh"]
        story["impactZh"] = story.get("impactZh") or story.get("impact") or rule_impact({**source, **story})
        story["impact"] = story["impactZh"]
    return brief


def finalize_brief(brief, sources):
    stories = brief.get("topStories") or []
    regions = brief.get("regions") or []

    if regions and isinstance(regions[0], str):
        brief["regions"] = [
            {
                "name": name,
                "items": [
                    story.get("titleZh") or story.get("title", "")
                    for story in stories
                    if story.get("region") == name
                ][:4],
            }
            for name in regions
        ]
    elif not regions:
        brief["regions"] = [
            {
                "name": region["name"],
                "items": [
                    story.get("titleZh") or story.get("title", "")
                    for story in stories
                    if story.get("region") == region["name"]
                ][:4],
            }
            for region in sources.get("regions", [])
        ]

    metrics = brief.setdefault("metrics", {})
    metrics["articles"] = metrics.get("articles") or metrics.get("totalArticles") or len(stories)
    if isinstance(metrics.get("regions"), list):
        metrics["regions"] = len(metrics["regions"])
    metrics.setdefault("regions", len(brief.get("regions") or sources.get("regions", [])))
    metrics.setdefault("hotspots", len(brief.get("analysis") or []))

    brief["status"] = "published"
    brief["broadcastScript"] = render_broadcast_script(brief)
    return brief


def render_broadcast_script(brief):
    date = brief.get("date") or TODAY
    headline = brief.get("headline") or brief.get("summary") or "今日财经要闻"
    summary = brief.get("summary") or ""
    stories = (brief.get("topStories") or [])[:5]
    analysis = (brief.get("analysis") or [])[:2]

    parts = date.split("-")
    date_cn = f"{parts[0]}年{int(parts[1])}月{int(parts[2])}日" if len(parts) == 3 else date
    intro = (
        f"各位观众大家好，欢迎收看岚序财经。今天是{date_cn}。"
        f"接下来为您播报今日亚洲与海湾地区财经要点。"
    )

    segments = []
    if summary:
        segments.append({"title": "今日概览", "text": summary})

    for index, story in enumerate(stories, start=1):
        title = story.get("titleZh") or story.get("title") or "要闻"
        region = story.get("region") or ""
        body = story.get("summaryZh") or story.get("summary") or ""
        impact = story.get("impactZh") or story.get("impact") or ""
        text = f"第{index}条，{region}{title}。{body}"
        if impact:
            text += f"影响方面，{impact}"
        segments.append({"title": title, "text": text})

    for item in analysis:
        title = item.get("titleZh") or item.get("title") or "热点解读"
        text = item.get("textZh") or item.get("text") or item.get("summary") or ""
        if text:
            segments.append({"title": title, "text": f"热点解读。{text}"})

    outro = f"今日重点，{headline}。感谢收看岚序财经，我们明天见。"

    return {
        "anchorName": "岚序",
        "date": date,
        "headline": headline,
        "intro": intro,
        "segments": segments,
        "outro": outro,
    }


def rebuild_archive_index():
    items = []
    for path in sorted(ARCHIVE_DIR.glob("*.json"), reverse=True):
        try:
            brief = read_json(path)
            items.append(
                {
                    "date": brief.get("date") or path.stem,
                    "headline": brief.get("headline") or brief.get("summary", "")[:80],
                    "summary": brief.get("summary", ""),
                    "articleCount": len(brief.get("topStories") or []),
                }
            )
        except Exception:
            continue
    write_json(
        DATA_DIR / "archive-index.json",
        {"updatedAt": now_iso(), "items": items},
    )


def write_feed(brief):
    site_url = "https://lanxucaijing.com"
    items = []
    for story in (brief.get("topStories") or [])[:12]:
        title = story.get("titleZh") or story.get("title") or "Untitled"
        link = story.get("url") or site_url
        pub = story.get("publishedAt") or brief.get("generatedAt") or now_iso()
        summary = story.get("summaryZh") or story.get("summary") or ""
        items.append(
            "    <item>\n"
            f"      <title>{xml_escape(title)}</title>\n"
            f"      <link>{xml_escape(link)}</link>\n"
            f"      <guid isPermaLink=\"false\">{xml_escape(link)}</guid>\n"
            f"      <pubDate>{xml_escape(format_rfc822(pub))}</pubDate>\n"
            f"      <description>{xml_escape(summary)}</description>\n"
            "    </item>"
        )

    feed = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n'
        "  <channel>\n"
        "    <title>岚序财经｜Lanxu Finance</title>\n"
        f"    <link>{site_url}/</link>\n"
        "    <description>香港、新加坡、阿联酋与海湾国家经济政策日报</description>\n"
        f"    <lastBuildDate>{xml_escape(format_rfc822(brief.get('generatedAt') or now_iso()))}</lastBuildDate>\n"
        f"{chr(10).join(items)}\n"
        "  </channel>\n"
        "</rss>\n"
    )
    (ROOT / "feed.xml").write_text(feed, encoding="utf-8")


def xml_escape(value):
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def format_rfc822(value):
    try:
        normalized = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.strftime("%a, %d %b %Y %H:%M:%S +0000")
    except Exception:
        return datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")


def format_openai_error(exc):
    message = str(exc)
    if "DeepSeek" in message and ("401" in message or "403" in message):
        return "DeepSeek key 无效、权限不足或账户不可用。请检查 DEEPSEEK_API_KEY。"
    if "DeepSeek" in message and "429" in message:
        return "DeepSeek 返回 429，通常是限速或余额/额度问题。网站仍会正常生成规则版日报。"
    if "429" in message:
        return "OpenAI 返回 429，通常是额度、账单、限速或模型权限问题。网站仍会正常生成规则版日报。"
    if "401" in message:
        return "OpenAI key 无效或已撤销。请重新创建 key 并设置 OPENAI_API_KEY。"
    if "model" in message.lower():
        return "当前账号可能不能使用设置的模型。可以先把 OPENAI_MODEL 改成 gpt-4o-mini 再试。"
    return short_error(message)


def short_error(exc):
    value = str(exc).replace("\n", " ")
    return value[:180] + ("..." if len(value) > 180 else "")


def render_newsletter(brief):
    stories = []
    for index, story in enumerate(brief.get("topStories", []), 1):
        stories.append(
            f"{index}. **{story['title']}**\n"
            f"   - 地区：{story['region']}｜主题：{story['topic']}｜来源：{story['source']}\n"
            f"   - 摘要：{story['summary']}\n"
            f"   - 影响：{story['impact']}\n"
            f"   - 原文标题：{story.get('originalTitle', story['title'])}\n"
            f"   - 原文：{story['url']}"
        )
    analysis = "\n".join(f"- **{item['title']}**：{item['body']}" for item in brief.get("analysis", []))
    return f"# 岚序财经｜Lanxu Finance｜{brief['date']}\n\n{brief['summary']}\n\n## 今日重点\n\n{chr(10).join(stories) or '暂无新闻。'}\n\n## 热点解读\n\n{analysis or '暂无解读。'}\n"


def build_rule_analysis(stories):
    return [
        {"label": story["topic"], "title": f"{story['region']}：{story.get('titleZh', story['title'])}", "body": story["impact"]}
        for story in stories[:3]
    ]


def make_chinese_title(article):
    region = article.get("region", "相关地区")
    topic = article.get("topic", "经济政策")
    source = article.get("source", "相关来源")
    title = article.get("title", "")

    if contains_cjk(title):
        return title

    action = topic_action(topic)
    return f"{region}{topic}动态：{source}{action}"


def rule_summary(article):
    region = article.get("region", "相关地区")
    topic = article.get("topic", "经济政策")
    source = article.get("source", "相关来源")
    title = article.get("title", "")
    if contains_cjk(article.get("description", "")):
        return article.get("description", "")
    return f"这条来自 {source} 的消息涉及{region}的{topic}变化，适合继续跟踪其对政策、资本流动和企业决策的影响。原文标题：{title}"


def topic_action(topic):
    actions = {
        "税务与自由区": "释放税务与企业落地相关信号",
        "金融监管": "出现监管与金融市场相关变化",
        "能源与产业投资": "呈现能源与产业资本新动向",
        "主权基金": "涉及主权资本与跨境投资动向",
        "贸易与物流": "出现贸易、关税或物流相关变化",
        "资本市场": "释放资本市场和融资环境信号",
        "经济政策": "出现经济政策相关变化",
    }
    return actions.get(topic, "出现新的区域经济信号")


def contains_cjk(value):
    return bool(re.search(r"[\u4e00-\u9fff]", str(value or "")))


def normalize_google_news_item(item):
    title, source = split_google_title(item.get("title", ""))
    description, _ = split_google_title(item.get("description", ""))
    return {
        **item,
        "title": title,
        "description": description,
        "source": source or item.get("source", "Google News"),
    }


def split_google_title(title):
    value = clean(title)
    if " - " not in value:
        return value, ""
    body, source = value.rsplit(" - ", 1)
    if len(source) > 60:
        return value, ""
    return body.strip(), source.strip()


def is_blocked(article, domains):
    source = str(article.get("source", "")).lower()
    url = str(article.get("url", "")).lower()
    return any(domain in source or domain in url for domain in domains)


def source_quality_score(article, trusted_domains):
    source = str(article.get("source", "")).lower()
    url = str(article.get("url", "")).lower()
    if any(domain in source or domain in url for domain in trusted_domains):
        return 25
    if article.get("source") and article["source"] != "news.google.com":
        return 8
    return 0


def region_matches(article, required_terms):
    if not required_terms:
        return True
    text = f"{article.get('title', '')} {article.get('description', '')} {article.get('source', '')}".lower()
    return any(term.lower() in text for term in required_terms)


def load_previous_brief():
    latest = DATA_DIR / "latest.json"
    if not latest.exists():
        return None
    try:
        return read_json(latest)
    except Exception:
        return None


def sample_brief(sources):
    return {
        "date": TODAY,
        "generatedAt": now_iso(),
        "status": "sample-fallback",
        "headline": "海湾资本与亚洲金融中心的连接正在增强",
        "summary": "当前新闻源暂时不可用，系统展示样例日报结构。正式运行时会自动替换为当日新闻、摘要、热点解读和原文链接。",
        "metrics": {"articles": 0, "regions": len(sources["regions"]), "hotspots": 3},
        "topStories": [
            {
                "title": "海湾资本继续寻找亚洲资产，香港与新加坡的金融通道价值上升",
                "region": "海湾国家",
                "topic": "资本市场",
                "source": "Sample Desk",
                "url": "#",
                "publishedAt": now_iso(),
                "summary": "主权基金、家族办公室和跨境财富管理动作密集，区域金融中心之间的规则、税务与产品互认值得持续观察。",
                "impact": "对跨境投融资、财富管理和区域总部选址有直接参考价值。",
                "score": 92,
            },
            {
                "title": "监管机构释放资本市场优化信号",
                "region": "香港",
                "topic": "金融监管",
                "source": "Sample Desk",
                "url": "#",
                "publishedAt": now_iso(),
                "summary": "关注上市制度、互联互通、财富管理和虚拟资产监管的连续变化。",
                "impact": "可能影响券商、资管机构、上市企业和跨境投资产品设计。",
                "score": 84,
            },
            {
                "title": "自由区、企业税和数字资产政策影响企业落地",
                "region": "阿联酋",
                "topic": "税务与自由区",
                "source": "Sample Desk",
                "url": "#",
                "publishedAt": now_iso(),
                "summary": "迪拜与阿布扎比继续竞争区域总部、金融科技和产业资本。",
                "impact": "企业应关注牌照、税务、用工和数据合规的组合成本。",
                "score": 81,
            },
        ],
        "regions": [
            {"name": region["name"], "items": ["等待正式新闻源生成。"]}
            for region in sources["regions"]
        ],
        "analysis": [
            {
                "label": "政策",
                "title": "为什么区域总部政策值得持续跟踪？",
                "body": "税务、签证、金融牌照和数据合规会直接影响企业把中东或东南亚总部放在哪里。",
            },
            {
                "label": "金融",
                "title": "海湾资金进入亚洲的路径正在变化",
                "body": "主权基金、家办和产业资本的动作往往早于公开交易，适合持续追踪。",
            },
            {
                "label": "风险",
                "title": "监管收紧会改变进入门槛",
                "body": "反洗钱、税务透明、虚拟资产和外资审查规则会提升合规成本。",
            },
        ],
    }


def balanced_articles(articles, regions, limit):
    selected = []
    selected_keys = set()
    for region in regions:
        for article in articles:
            key = normalize_key(article["url"] or article["title"])
            if article["region"] == region["name"] and key not in selected_keys:
                selected.append(article)
                selected_keys.add(key)
                break
    for article in articles:
        if len(selected) >= limit:
            break
        key = normalize_key(article["url"] or article["title"])
        if key not in selected_keys:
            selected.append(article)
            selected_keys.add(key)
    return selected[:limit]


def infer_topic(text):
    if "tax" in text or "free zone" in text:
        return "税务与自由区"
    if "central bank" in text or "monetary" in text or "regulation" in text:
        return "金融监管"
    if "energy" in text or "oil" in text or "gas" in text:
        return "能源与产业投资"
    if "sovereign" in text or "fund" in text or "investment" in text:
        return "主权基金"
    if "trade" in text or "logistics" in text or "port" in text:
        return "贸易与物流"
    if "market" in text or "capital" in text:
        return "资本市场"
    return "经济政策"


def rule_impact(article):
    impacts = {
        "税务与自由区": "可能影响企业设立、区域总部选址和跨境税务安排。",
        "金融监管": "可能影响金融牌照、财富管理、资金流动和合规成本。",
        "能源与产业投资": "可能影响能源项目、产业资本配置和区域供应链。",
        "主权基金": "可能影响跨境并购、私募融资和亚洲资产配置。",
    }
    return impacts.get(article["topic"], "适合继续观察后续政策文件、监管公告和市场反应。")


def tag(xml, name):
    match = re.search(rf"<{name}[^>]*>([\s\S]*?)</{name}>", xml, flags=re.I)
    return html.unescape(match.group(1)) if match else ""


def strip_html(value):
    return re.sub(r"<[^>]*>", " ", value)


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(str(value or "")).replace("<![CDATA[", "").replace("]]>", "")).strip()


def parse_date(value):
    if not value:
        return ""
    try:
        return email.utils.parsedate_to_datetime(value).isoformat()
    except Exception:
        return value


def is_recent(value, days=14):
    if not value:
        return True
    try:
        normalized = str(value).replace("Z", "+00:00")
        if re.match(r"^\d{8}T\d{6}", normalized):
            parsed = datetime.strptime(normalized[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        else:
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - parsed).days <= days
    except Exception:
        return True


def normalize_key(value):
    return re.sub(r"/$", "", str(value).lower().replace("https://", "").replace("http://", ""))


def domain_name(url):
    try:
        return urllib.parse.urlparse(url).hostname.replace("www.", "")
    except Exception:
        return "Unknown"


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
