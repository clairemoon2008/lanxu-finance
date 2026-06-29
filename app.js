import {
  STORY_BATCH,
  translations,
  t,
  fetchJson,
  normalizeBrief,
  displayTitle,
  displaySummary,
  displayImpact,
  localizeRegion,
  localizeTopic,
  escapeHtml,
  escapeAttr,
  applyLanguage,
  bindLanguageControls,
  renderTitleLink,
  getStoryHref,
  formatBriefDate,
  formatUpdatedAt
} from "./shared.js";

const fallback = {
  date: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toISOString(),
  headline: "香港、新加坡与阿联酋最新财经动态",
  summary: "新闻源正在更新，请稍后刷新。",
  metrics: { articles: 0, regions: 4, hotspots: 0 },
  topStories: [],
  regions: [],
  analysis: []
};

const langRef = { current: localStorage.getItem("lanxu-language") || "zh" };
let data = null;
let storyLimit = STORY_BATCH;
let archivePool = [];
let archiveReady = false;
let siteConfig = {};

const els = {
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  subscribeForm: document.getElementById("subscribeForm"),
  subscribeNote: document.getElementById("subscribeNote")
};

init();

async function init() {
  siteConfig = await fetchJson("./data/site-config.json").catch(() => ({}));
  data = await fetchBrief();
  bindLanguageControls(langRef, () => renderBrief(data));
  bindLoadMore();
  bindInfiniteScroll();
  bindSubscribe();
  applyLanguage(langRef.current);
  renderBrief(data);
}

async function fetchBrief() {
  try {
    return normalizeBrief(await fetchJson("./data/latest.json"));
  } catch (error) {
    console.warn("Brief load failed:", error);
    return normalizeBrief(fallback);
  }
}

async function ensureArchiveStories() {
  if (archiveReady) return;
  archiveReady = true;
  try {
    const index = await fetchJson("./data/archive-index.json");
    const dates = (index.items || [])
      .map((item) => item.date)
      .filter((date) => date && date !== data.date);

    for (const date of dates) {
      try {
        const brief = normalizeBrief(await fetchJson(`./daily/${date}.json`));
        const stories = (brief.topStories || []).slice(1).map((story) => ({
          ...story,
          briefDate: date
        }));
        archivePool.push(...stories);
      } catch (error) {
        console.warn(`Archive load failed for ${date}:`, error);
      }
    }
  } catch (error) {
    console.warn("Archive index load failed:", error);
  }
}

function getSecondaryStories() {
  return [...(data.topStories || []).slice(1), ...archivePool];
}

function bindLoadMore() {
  els.loadMoreBtn?.addEventListener("click", async () => {
    await ensureArchiveStories();
    storyLimit += STORY_BATCH;
    renderStoryList(getSecondaryStories(), langRef.current);
  });
}

function bindInfiniteScroll() {
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking || !els.loadMoreBtn || els.loadMoreBtn.hidden) return;
    ticking = true;
    requestAnimationFrame(async () => {
      ticking = false;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 320;
      if (!nearBottom) return;
      await ensureArchiveStories();
      storyLimit += STORY_BATCH;
      renderStoryList(getSecondaryStories(), langRef.current);
    });
  });
}

function bindSubscribe() {
  els.subscribeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("subscribeEmail");
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showSubscribeNote(t(langRef.current, "subscribeInvalid"), true);
      return;
    }

    if (siteConfig.subscribeEndpoint) {
      try {
        await fetch(siteConfig.subscribeEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email, source: "lanxu-finance" })
        });
      } catch (error) {
        console.warn("Subscribe endpoint failed:", error);
      }
    }

    const saved = JSON.parse(localStorage.getItem("lanxu-subscribers") || "[]");
    if (!saved.includes(email)) saved.push(email);
    localStorage.setItem("lanxu-subscribers", JSON.stringify(saved));
    input.value = "";
    showSubscribeNote(t(langRef.current, "subscribeSuccess"), false);
  });
}

function showSubscribeNote(message, isError) {
  if (!els.subscribeNote) return;
  els.subscribeNote.hidden = false;
  els.subscribeNote.textContent = message;
  els.subscribeNote.classList.toggle("error", isError);
}

function renderBrief(brief) {
  const lang = langRef.current;
  archivePool = [];
  archiveReady = false;

  document.querySelector('[data-metric="articles"]').textContent = brief.metrics?.articles ?? 0;
  document.querySelector('[data-metric="regions"]').textContent = brief.metrics?.regions ?? 0;
  document.querySelector('[data-metric="hotspots"]').textContent = brief.metrics?.hotspots ?? 0;
  document.querySelector("#daily-summary").textContent = brief.summary || brief.headline || t(lang, "fallbackSummary");
  document.querySelector("#daily-date").textContent = `${t(lang, "dateLabel")}：${formatBriefDate(brief.date, lang)}`;
  document.querySelector("#daily-updated").textContent = `${t(lang, "updatedLabel")}：${formatUpdatedAt(brief.generatedAt, lang)}`;

  storyLimit = STORY_BATCH;
  const [lead, ...rest] = brief.topStories || [];
  renderLead(lead, lang);
  renderStoryList(rest, lang);
  renderRegions(brief.regions || [], lang);
  renderAnalysis(brief.analysis || [], lang);
  renderTicker(brief.topStories || [], lang);
  updateMeta(brief);
}

function updateMeta(brief) {
  const desc = brief.summary || brief.headline;
  if (!desc) return;
  document.querySelector('meta[name="description"]')?.setAttribute("content", desc.slice(0, 160));
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", desc.slice(0, 160));
}

function renderTicker(stories, lang) {
  const ticker = document.getElementById("ticker");
  if (!ticker || !stories.length) return;
  const items = stories.slice(0, 8).map((story) => {
    const title = displayTitle(story, lang);
    const region = localizeRegion(story.region, lang);
    return `<span>${escapeHtml(region)} · ${escapeHtml(title.slice(0, 48))}${title.length > 48 ? "…" : ""}</span>`;
  });
  ticker.innerHTML = items.join("") + items.join("");
  ticker.classList.add("ticker-animate");
}

function renderLead(story, lang) {
  const target = document.querySelector("#lead-story");
  if (!story) {
    target.innerHTML = `
      <span class="tag">${escapeHtml(t(lang, "noNewsTag"))}</span>
      <h3>${escapeHtml(t(lang, "noNewsTitle"))}</h3>
      <p>${escapeHtml(t(lang, "noNewsText"))}</p>
    `;
    return;
  }
  target.innerHTML = `
    <span class="tag">${escapeHtml(localizeRegion(story.region, lang) || t(lang, "tagLead"))}</span>
    <h3>${renderTitleLink(story, lang, "story-title-link lead-title-link")}</h3>
    <p>${escapeHtml(displaySummary(story, lang))}</p>
    <p class="impact">${escapeHtml(displayImpact(story, lang))}</p>
    ${renderOriginalTitle(story, lang)}
    ${getStoryHref(story) ? "" : `<span class="no-source">${escapeHtml(t(lang, "sourcePending"))}</span>`}
  `;
}

function renderStoryList(stories, lang) {
  const target = document.querySelector("#story-list");
  const visible = stories.slice(0, storyLimit);
  target.innerHTML = visible
    .map((story) => {
      const dayLabel = story.briefDate
        ? `${t(lang, "archiveDayLabel")} · ${story.briefDate}`
        : t(lang, "todayLabel");
      return `
        <article>
          <span>${escapeHtml(dayLabel)} · ${escapeHtml(localizeRegion(story.region, lang) || t(lang, "globalRegion"))} · ${escapeHtml(localizeTopic(story.topic, lang) || t(lang, "defaultTopic"))}</span>
          <h3>${renderTitleLink(story, lang)}</h3>
          <p>${escapeHtml(displaySummary(story, lang) || displayImpact(story, lang))}</p>
          ${renderOriginalTitle(story, lang)}
        </article>
      `;
    })
    .join("");

  if (els.loadMoreBtn) {
    const hasMore = storyLimit < stories.length;
    els.loadMoreBtn.hidden = !hasMore;
    els.loadMoreBtn.textContent = archivePool.length
      ? t(lang, "loadMoreArchive")
      : t(lang, "loadMore");
  }
}

function renderOriginalTitle(story, lang) {
  const originalTitle = story.originalTitle || story.title;
  if (!originalTitle || originalTitle === displayTitle(story, lang)) return "";
  return `<p class="original-title">${escapeHtml(t(lang, "originalTitleLabel"))}：${escapeHtml(originalTitle)}</p>`;
}

function renderRegions(regions, lang) {
  document.querySelector("#region-grid").innerHTML = regions
    .map(
      (region) => `
        <article>
          <h3>${escapeHtml(localizeRegion(region.name, lang))}</h3>
          <p>${escapeHtml((region.items || []).join("；") || t(lang, "noRegionItems"))}</p>
        </article>
      `
    )
    .join("");
}

function renderAnalysis(items, lang) {
  document.querySelector("#analysis-layout").innerHTML = items
    .map(
      (item) => `
        <article class="analysis-card">
          <span class="tag">${escapeHtml(localizeTopic(item.label, lang) || t(lang, "defaultAnalysisLabel"))}</span>
          <h3>${escapeHtml(lang === "en" ? item.titleEn || item.title : item.title)}</h3>
          <p>${escapeHtml(lang === "en" ? item.bodyEn || item.body : item.body || "")}</p>
        </article>
      `
    )
    .join("");
}
