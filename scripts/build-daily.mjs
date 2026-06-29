import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dataDir = path.join(root, "data");
const archiveDir = path.join(root, "daily");
const newsletterDir = path.join(root, "newsletters");
const sourcesPath = path.join(dataDir, "sources.json");
const latestPath = path.join(dataDir, "latest.json");

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const sources = JSON.parse(await fs.readFile(sourcesPath, "utf8"));
  const fetched = await collectArticles(sources);
  const ranked = rankAndDedupe(fetched, sources).slice(0, 24);
  const brief = await buildBrief(ranked, sources);

  await fs.mkdir(archiveDir, { recursive: true });
  await fs.mkdir(newsletterDir, { recursive: true });
  await fs.writeFile(latestPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(archiveDir, `${today}.json`), `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(newsletterDir, `${today}.md`), renderNewsletter(brief), "utf8");

  console.log(`Generated ${ranked.length} articles into data/latest.json`);
}

async function collectArticles(sources) {
  const all = [];
  for (const region of sources.regions) {
    if (region.queries?.length) {
      const combinedQuery = region.queries.map((query) => `(${query})`).join(" OR ");
      let regionArticles = await fetchGdelt(combinedQuery, region.name);
      if (regionArticles.length === 0) {
        regionArticles = [];
        for (const query of region.queries) {
          regionArticles.push(...(await fetchGoogleNews(`${query} when:14d`, region.name)));
          await wait(500);
        }
      }
      all.push(...regionArticles);
      await wait(1500);
    }
    for (const feedUrl of region.rss) {
      all.push(...(await fetchRss(feedUrl, region.name)));
    }
  }
  return all;
}

async function fetchGdelt(query, region) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "20");
  url.searchParams.set("sort", "HybridRel");
  url.searchParams.set("timespan", "14d");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    return (payload.articles || []).map((item) => ({
      title: clean(item.title),
      region,
      source: item.sourceCountry || domainName(item.url),
      url: item.url,
      publishedAt: item.seendate || item.socialimage || new Date().toISOString(),
      description: clean(item.title),
      raw: item
    }));
  } catch (error) {
    console.warn(`GDELT failed: ${region} / ${query}: ${error.message}`);
    return [];
  }
}

async function fetchRss(feedUrl, region) {
  try {
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    return parseRss(xml).map((item) => ({
      ...item,
      region,
      source: domainName(item.url || feedUrl)
    }));
  } catch (error) {
    console.warn(`RSS failed: ${region} / ${feedUrl}: ${error.message}`);
    return [];
  }
}

async function fetchGoogleNews(query, region) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  const items = await fetchRss(url.toString(), region);
  return items.map(normalizeGoogleNewsItem);
}

function parseRss(xml) {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return itemBlocks.slice(0, 20).map((block) => ({
    title: clean(tag(block, "title")),
    url: clean(tag(block, "link")),
    publishedAt: clean(tag(block, "pubDate")) || new Date().toISOString(),
    description: clean(stripHtml(tag(block, "description")))
  }));
}

function rankAndDedupe(articles, sources) {
  const seen = new Set();
  const regionRules = new Map(sources.regions.map((region) => [region.name, region.requiredTerms || []]));
  const keywords = sources.hotKeywords || [];
  const trustedDomains = sources.trustedDomains || [];
  const blockedDomains = sources.blockedDomains || [];
  return articles
    .filter((article) => article.title && article.url)
    .filter((article) => isRecent(article.publishedAt))
    .filter((article) => !isBlocked(article, blockedDomains))
    .filter((article) => regionMatches(article, regionRules.get(article.region) || []))
    .map((article) => {
      const text = `${article.title} ${article.description}`.toLowerCase();
      const keywordScore = keywords.reduce((score, keyword) => {
        return score + (text.includes(keyword.toLowerCase()) ? 10 : 0);
      }, 0);
      const sourceScore = sourceQualityScore(article, trustedDomains);
      const recencyScore = article.publishedAt ? 8 : 0;
      return {
        ...article,
        topic: inferTopic(text),
        score: Math.min(99, 35 + keywordScore + sourceScore + recencyScore)
      };
    })
    .sort((a, b) => b.score - a.score)
    .filter((article) => {
      const key = normalizeKey(article.url || article.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeGoogleNewsItem(item) {
  const [title, source] = splitGoogleTitle(item.title || "");
  const [description] = splitGoogleTitle(item.description || "");
  return {
    ...item,
    title,
    description,
    source: source || item.source || "Google News"
  };
}

function splitGoogleTitle(title) {
  const value = clean(title);
  if (!value.includes(" - ")) return [value, ""];
  const index = value.lastIndexOf(" - ");
  const body = value.slice(0, index).trim();
  const source = value.slice(index + 3).trim();
  if (source.length > 60) return [value, ""];
  return [body, source];
}

function isBlocked(article, domains) {
  const source = String(article.source || "").toLowerCase();
  const url = String(article.url || "").toLowerCase();
  return domains.some((domain) => source.includes(domain) || url.includes(domain));
}

function sourceQualityScore(article, trustedDomains) {
  const source = String(article.source || "").toLowerCase();
  const url = String(article.url || "").toLowerCase();
  if (trustedDomains.some((domain) => source.includes(domain) || url.includes(domain))) return 25;
  if (article.source && article.source !== "news.google.com") return 8;
  return 0;
}

function regionMatches(article, requiredTerms) {
  if (!requiredTerms.length) return true;
  const text = `${article.title || ""} ${article.description || ""} ${article.source || ""}`.toLowerCase();
  return requiredTerms.some((term) => text.includes(term.toLowerCase()));
}

function isRecent(value, days = 14) {
  if (!value) return true;
  let parsed;
  if (/^\d{8}T\d{6}/.test(value)) {
    parsed = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`);
  } else {
    parsed = new Date(value);
  }
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() <= days * 24 * 60 * 60 * 1000;
}

async function buildBrief(articles, sources) {
  if (process.env.OPENAI_API_KEY && articles.length > 0) {
    const aiBrief = await buildWithOpenAI(articles, sources).catch((error) => {
      console.warn(`OpenAI summary failed, using rule summary: ${error.message}`);
      return null;
    });
    if (aiBrief) return aiBrief;
  }

  const topStories = balancedArticles(articles, sources.regions, 8).map((article) => ({
    title: article.title,
    region: article.region,
    topic: article.topic,
    source: article.source,
    url: article.url,
    publishedAt: article.publishedAt,
    summary: article.description || "该条新闻需要人工或 AI 进一步摘要。",
    impact: ruleImpact(article),
    score: article.score
  }));

  if (topStories.length === 0) {
    const previous = await loadPreviousBrief();
    if (previous?.topStories?.length) {
      return {
        ...previous,
        status: "stale-cache",
        summary: "今日抓取未成功，首页暂时保留上一版日报。请稍后重试或检查新闻源限流情况。",
        generatedAt: new Date().toISOString()
      };
    }
  }

  return {
    date: today,
    generatedAt: new Date().toISOString(),
    status: articles.length ? "rule-generated" : "empty",
    headline: topStories[0]?.title || "今日暂无可用新闻",
    summary:
      topStories.length > 0
        ? "系统已完成抓取、去重和热度排序。配置 OpenAI API key 后，将自动生成更完整的中文摘要和热点解读。"
        : "没有抓取到新闻。请检查网络、新闻源或 API 配置。",
    metrics: {
      articles: articles.length,
      regions: sources.regions.length,
      hotspots: Math.min(3, topStories.length)
    },
    topStories,
    regions: sources.regions.map((region) => ({
      name: region.name,
      items: topStories.filter((story) => story.region === region.name).slice(0, 4).map((story) => story.title)
    })),
    analysis: buildRuleAnalysis(topStories)
  };
}

async function loadPreviousBrief() {
  try {
    return JSON.parse(await fs.readFile(latestPath, "utf8"));
  } catch {
    return null;
  }
}

function balancedArticles(articles, regions, limit) {
  const selected = [];
  const keys = new Set();
  for (const region of regions) {
    const found = articles.find((article) => article.region === region.name && !keys.has(normalizeKey(article.url || article.title)));
    if (found) {
      selected.push(found);
      keys.add(normalizeKey(found.url || found.title));
    }
  }
  for (const article of articles) {
    if (selected.length >= limit) break;
    const key = normalizeKey(article.url || article.title);
    if (!keys.has(key)) {
      selected.push(article);
      keys.add(key);
    }
  }
  return selected.slice(0, limit);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildWithOpenAI(articles, sources) {
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const prompt = {
    role: "user",
    content: [
      {
        type: "input_text",
        text: `你是面向跨境投资、贸易、金融和政策研究人群的中文经济情报编辑。请基于新闻列表生成严格 JSON，不要 Markdown。字段必须包括 date, generatedAt, status, headline, summary, metrics, topStories, regions, analysis。topStories 每条包含 title, region, topic, source, url, publishedAt, summary, impact, score。analysis 每条包含 label, title, body。请保留原文链接，不要编造事实。\n\n日期：${today}\n地区：${sources.regions.map((r) => r.name).join("、")}\n新闻：${JSON.stringify(articles.slice(0, 18))}`
      }
    ]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [prompt],
      text: {
        format: { type: "json_object" }
      }
    })
  });

  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const payload = await response.json();
  const text = payload.output_text || payload.output?.flatMap((o) => o.content || []).find((c) => c.text)?.text;
  const parsed = JSON.parse(text);
  return {
    date: today,
    generatedAt: new Date().toISOString(),
    status: "ai-generated",
    ...parsed
  };
}

function renderNewsletter(brief) {
  const stories = brief.topStories
    .map((story, index) => {
      return `${index + 1}. **${story.title}**\n   - 地区：${story.region}｜主题：${story.topic}｜来源：${story.source}\n   - 摘要：${story.summary}\n   - 影响：${story.impact}\n   - 原文：${story.url}`;
    })
    .join("\n\n");

  const analysis = brief.analysis
    .map((item) => `- **${item.title}**：${item.body}`)
    .join("\n");

  return `# 岚序财经｜Lanxu Finance｜${brief.date}\n\n${brief.summary}\n\n## 今日重点\n\n${stories || "暂无新闻。"}\n\n## 热点解读\n\n${analysis || "暂无解读。"}\n`;
}

function buildRuleAnalysis(stories) {
  const top = stories.slice(0, 3);
  if (top.length === 0) return [];
  return top.map((story) => ({
    label: story.topic,
    title: `${story.region}：${story.title}`,
    body: story.impact
  }));
}

function inferTopic(text) {
  if (text.includes("tax") || text.includes("free zone")) return "税务与自由区";
  if (text.includes("central bank") || text.includes("monetary") || text.includes("regulation")) return "金融监管";
  if (text.includes("energy") || text.includes("oil") || text.includes("gas")) return "能源与产业投资";
  if (text.includes("sovereign") || text.includes("fund") || text.includes("investment")) return "主权基金";
  if (text.includes("trade") || text.includes("logistics") || text.includes("port")) return "贸易与物流";
  if (text.includes("market") || text.includes("capital")) return "资本市场";
  return "经济政策";
}

function ruleImpact(article) {
  const topic = article.topic;
  if (topic === "税务与自由区") return "可能影响企业设立、区域总部选址和跨境税务安排。";
  if (topic === "金融监管") return "可能影响金融牌照、财富管理、资金流动和合规成本。";
  if (topic === "能源与产业投资") return "可能影响能源项目、产业资本配置和区域供应链。";
  if (topic === "主权基金") return "可能影响跨境并购、私募融资和亚洲资产配置。";
  return "适合继续观察后续政策文件、监管公告和市场反应。";
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, " ");
}

function clean(value = "") {
  return decodeEntities(String(value)).replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeKey(value) {
  return value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function domainName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown";
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
