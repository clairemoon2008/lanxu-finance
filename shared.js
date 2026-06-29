export const STORY_BATCH = 5;

export const translations = {
  zh: {
    navBrief: "今日简报",
    navRegions: "地区",
    navAnalysis: "热点解读",
    navArchive: "历史归档",
    navSubscribe: "订阅",
    navHome: "返回首页",
    heroEyebrow: "Lanxu Finance · 每日更新 · 保留原文出处",
    heroTitle: "追踪香港、新加坡、阿联酋与海湾国家的经济政策变化",
    heroText:
      "面向跨境投资、贸易、金融、出海服务和区域研究人群，自动汇总政策信号、市场动态与产业趋势，并给出可读的热点解读。",
    heroPrimary: "查看今日简报",
    heroSecondary: "订阅日报",
    metricArticles: "今日新闻",
    metricRegions: "覆盖地区",
    metricHotspots: "重点解读",
    tickerHongKong: "香港资本市场改革",
    tickerSingapore: "新加坡金融监管",
    tickerUae: "阿联酋税务政策",
    tickerSaudi: "沙特产业投资",
    tickerQatar: "卡塔尔能源与主权基金",
    briefTitle: "今日简报",
    regionsTitle: "地区监测",
    analysisTitle: "热点解读",
    archiveTitle: "历史日报归档",
    archiveDesc: "查阅过往经济政策简报，了解区域政策演变脉络。",
    archiveLoading: "正在加载归档列表…",
    archiveBack: "← 返回列表",
    subscribeTitle: "订阅每日经济政策简报",
    subscribeText: "留下邮箱，每日接收香港、新加坡、阿联酋与海湾国家的政策摘要与热点解读。",
    subscribeButton: "订阅日报",
    subscribeSuccess: "感谢订阅！我们已记录您的邮箱，正式推送上线后将第一时间通知您。",
    subscribeInvalid: "请输入有效的邮箱地址。",
    footerText: "Lanxu Finance · 亚洲与海湾经济政策情报",
    tagLead: "重点",
    loadingTitle: "正在加载最新内容",
    loadingText: "请稍候，正在获取今日经济政策简报。",
    fallbackDate: "待更新",
    fallbackSummary: "今日简报暂时无法加载，请稍后刷新页面。",
    dateLabel: "日期",
    updatedLabel: "更新时间",
    noNewsTag: "暂无",
    noNewsTitle: "今日暂无可用新闻",
    noNewsText: "新闻源正在更新中，请稍后回来查看。",
    originalLink: "查看原文",
    storyOriginalLink: "原文链接",
    searchSource: "搜索原文",
    originalTitleLabel: "原文标题",
    globalRegion: "全球",
    defaultTopic: "经济政策",
    noRegionItems: "今日暂无重点。",
    defaultAnalysisLabel: "解读",
    loadMore: "加载更多新闻",
    loadMoreArchive: "加载历史新闻",
    todayLabel: "今日",
    archiveDayLabel: "历史",
    sourcePending: "来源待补充"
  },
  en: {
    navBrief: "Brief",
    navRegions: "Regions",
    navAnalysis: "Analysis",
    navArchive: "Archive",
    navSubscribe: "Subscribe",
    navHome: "Home",
    heroEyebrow: "Lanxu Finance · Daily updates · Source-linked intelligence",
    heroTitle: "Track economic and policy shifts across Hong Kong, Singapore, the UAE and the Gulf",
    heroText:
      "Built for cross-border investors, trade operators, financial professionals and market researchers who need policy signals, market movement and regional context in one daily brief.",
    heroPrimary: "Read Today's Brief",
    heroSecondary: "Subscribe",
    metricArticles: "Stories",
    metricRegions: "Regions",
    metricHotspots: "Insights",
    tickerHongKong: "Hong Kong capital markets",
    tickerSingapore: "Singapore financial regulation",
    tickerUae: "UAE tax policy",
    tickerSaudi: "Saudi industrial investment",
    tickerQatar: "Qatar energy and sovereign funds",
    briefTitle: "Daily Brief",
    regionsTitle: "Regional Watch",
    analysisTitle: "Hotspot Analysis",
    archiveTitle: "Daily Brief Archive",
    archiveDesc: "Browse past economic policy briefs and track regional policy shifts.",
    archiveLoading: "Loading archive…",
    archiveBack: "← Back to list",
    subscribeTitle: "Subscribe to the daily policy brief",
    subscribeText: "Leave your email to receive daily summaries on Hong Kong, Singapore, the UAE and the Gulf.",
    subscribeButton: "Subscribe",
    subscribeSuccess: "Thank you! Your email has been saved. We will notify you when the newsletter goes live.",
    subscribeInvalid: "Please enter a valid email address.",
    footerText: "Lanxu Finance · Asia and Gulf economic policy intelligence",
    tagLead: "Top Story",
    loadingTitle: "Loading latest content",
    loadingText: "Fetching today's economic policy brief…",
    fallbackDate: "Pending",
    fallbackSummary: "Today's brief is temporarily unavailable. Please refresh later.",
    dateLabel: "Date",
    updatedLabel: "Updated",
    noNewsTag: "None",
    noNewsTitle: "No stories available today",
    noNewsText: "News sources are being updated. Please check back soon.",
    originalLink: "View Source",
    storyOriginalLink: "Source",
    searchSource: "Search source",
    originalTitleLabel: "Original Title",
    globalRegion: "Global",
    defaultTopic: "Economic Policy",
    noRegionItems: "No key items today.",
    defaultAnalysisLabel: "Analysis",
    loadMore: "Load more stories",
    loadMoreArchive: "Load archive stories",
    todayLabel: "Today",
    archiveDayLabel: "Archive",
    sourcePending: "Source pending"
  }
};

export function t(lang, key) {
  return translations[lang][key] || translations.zh[key] || key;
}

export async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json") && !contentType.includes("text/plain")) {
    throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
  }
  return response.json();
}

export function normalizeBrief(brief) {
  const copy = structuredClone(brief);
  const stories = copy.topStories || [];

  if (Array.isArray(copy.regions) && copy.regions.length && typeof copy.regions[0] === "string") {
    copy.regions = copy.regions.map((name) => ({
      name,
      items: stories
        .filter((story) => story.region === name)
        .map((story) => story.titleZh || story.title)
        .slice(0, 4)
    }));
  }

  copy.regions = (copy.regions || []).map((region) => {
    if (typeof region === "string") return { name: region, items: [] };
    return { name: region.name || region.region || "", items: region.items || [] };
  });

  const metrics = copy.metrics || {};
  metrics.articles = metrics.articles ?? metrics.totalArticles ?? stories.length;
  metrics.regions = Array.isArray(metrics.regions) ? metrics.regions.length : metrics.regions ?? copy.regions.length;
  metrics.hotspots = metrics.hotspots ?? (copy.analysis || []).length;
  copy.metrics = metrics;

  return copy;
}

export function displayTitle(story, lang) {
  if (lang === "en") return story.titleEn || story.originalTitle || story.title;
  return story.titleZh || (hasChinese(story.title) ? story.title : makeChineseTitle(story));
}

export function displaySummary(story, lang) {
  if (lang === "en") return story.summaryEn || story.originalSummary || story.summary || "";
  return story.summaryZh || (hasChinese(story.summary) ? story.summary : makeChineseSummary(story));
}

export function displayImpact(story, lang) {
  if (lang === "en") return story.impactEn || story.impact || "";
  return story.impactZh || story.impact || "";
}

export function localizeRegion(region, lang) {
  const map = { 香港: "Hong Kong", 新加坡: "Singapore", 阿联酋: "UAE", 海湾国家: "Gulf States" };
  return lang === "en" ? map[region] || region : region;
}

export function localizeTopic(topic, lang) {
  const map = {
    经济政策: "Economic Policy",
    金融监管: "Financial Regulation",
    资本市场: "Capital Markets",
    税务与自由区: "Tax and Free Zones",
    能源与产业投资: "Energy and Industrial Investment",
    主权基金: "Sovereign Funds",
    贸易与物流: "Trade and Logistics",
    政策: "Policy",
    金融: "Finance",
    风险: "Risk"
  };
  return lang === "en" ? map[topic] || topic : topic;
}

function hasChinese(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ""));
}

function makeChineseTitle(story) {
  const region = story.region || "相关地区";
  const topic = story.topic || "经济政策";
  const source = story.source || "相关来源";
  return `${region}${topic}动态：${source}发布最新政策信号`;
}

function makeChineseSummary(story) {
  const region = story.region || "相关地区";
  const topic = story.topic || "经济政策";
  const source = story.source || "相关来源";
  return `来自 ${source} 的消息涉及${region}的${topic}变化，建议持续跟踪其对政策与资本流动的影响。`;
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export function isValidSourceUrl(url) {
  return /^https?:\/\//i.test(String(url || "")) && !String(url).endsWith("#");
}

export function buildSourceSearchUrl(story) {
  const query = [story.originalTitle, story.source].filter(Boolean).join(" ");
  if (!query.trim()) return "";
  return `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(query)}`;
}

export function getStoryHref(story) {
  if (isValidSourceUrl(story.url)) return story.url;
  return buildSourceSearchUrl(story) || "";
}

export function renderTitleLink(story, lang, className = "story-title-link") {
  const title = displayTitle(story, lang);
  const href = getStoryHref(story);
  if (!href) {
    return `<span class="${className} is-plain">${escapeHtml(title)}</span>`;
  }
  return `<a class="${className}" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`;
}

export function formatBriefDate(dateStr, lang) {
  if (!dateStr) return lang === "zh" ? "待更新" : "Pending";
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) {
    return lang === "zh" ? `今日（${dateStr}）` : `Today (${dateStr})`;
  }
  return dateStr;
}

export function formatUpdatedAt(value, lang) {
  if (!value) return lang === "zh" ? "刚刚" : "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function applyLanguage(lang) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = translations[lang][node.dataset.i18n] || "";
  });
  document.querySelectorAll("[data-lang-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.langOption === lang));
  });
}

export function bindLanguageControls(langRef, onChange) {
  document.querySelectorAll("[data-lang-option]").forEach((button) => {
    button.addEventListener("click", () => {
      langRef.current = button.dataset.langOption;
      localStorage.setItem("lanxu-language", langRef.current);
      applyLanguage(langRef.current);
      onChange();
    });
  });
}
