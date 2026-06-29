import {
  translations,
  t,
  fetchJson,
  normalizeBrief,
  displayTitle,
  displaySummary,
  localizeRegion,
  localizeTopic,
  escapeHtml,
  escapeAttr,
  applyLanguage,
  bindLanguageControls
} from "./shared.js";

const langRef = { current: localStorage.getItem("lanxu-language") || "zh" };

const els = {
  loading: document.getElementById("archiveLoading"),
  list: document.getElementById("archiveList"),
  detail: document.getElementById("archiveDetail"),
  back: document.getElementById("archiveBack"),
  date: document.getElementById("archiveDate"),
  updated: document.getElementById("archiveUpdated"),
  summary: document.getElementById("archiveSummary"),
  stories: document.getElementById("archiveStories"),
  analysis: document.getElementById("archiveAnalysis")
};

init();

async function init() {
  bindLanguageControls(langRef, refreshView);
  applyLanguage(langRef.current);
  els.back?.addEventListener("click", () => {
    window.location.href = "./archive.html";
  });

  const params = new URLSearchParams(window.location.search);
  const date = params.get("date");

  try {
    const index = await fetchJson("./data/archive-index.json");
    if (date) {
      await showDetail(date);
    } else {
      renderList(index.items || []);
    }
  } catch (error) {
    console.warn(error);
    renderList([]);
  } finally {
    els.loading.hidden = true;
  }
}

function refreshView() {
  const date = new URLSearchParams(window.location.search).get("date");
  if (date) showDetail(date);
  else applyLanguage(langRef.current);
}

function renderList(items) {
  const lang = langRef.current;
  els.list.hidden = false;
  els.detail.hidden = true;

  if (!items.length) {
    els.list.innerHTML = `<p class="empty-state">${escapeHtml(lang === "zh" ? "暂无归档数据。" : "No archive data yet.")}</p>`;
    return;
  }

  els.list.innerHTML = items
    .map(
      (item) => `
        <article class="archive-card">
          <div class="archive-card-meta">
            <time datetime="${escapeAttr(item.date)}">${escapeHtml(item.date)}</time>
            <span>${escapeHtml(String(item.articleCount || 0))} ${escapeHtml(lang === "zh" ? "条新闻" : "stories")}</span>
          </div>
          <h2><a href="./archive.html?date=${escapeAttr(item.date)}">${escapeHtml(item.headline || item.date)}</a></h2>
          <p>${escapeHtml(item.summary || "")}</p>
          <a class="read-more" href="./archive.html?date=${escapeAttr(item.date)}">${escapeHtml(lang === "zh" ? "阅读全文 →" : "Read full brief →")}</a>
        </article>
      `
    )
    .join("");
}

async function showDetail(date) {
  const lang = langRef.current;
  els.list.hidden = true;
  els.detail.hidden = false;

  try {
    const brief = normalizeBrief(await fetchJson(`./daily/${date}.json`));
    els.date.textContent = `${t(lang, "dateLabel")}：${brief.date}`;
    els.updated.textContent = `${t(lang, "updatedLabel")}：${
      brief.generatedAt
        ? new Date(brief.generatedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")
        : "--"
    }`;
    els.summary.textContent = brief.summary || brief.headline || "";

    els.stories.innerHTML = (brief.topStories || [])
      .map(
        (story, index) => `
          <article class="archive-story">
            <span class="story-index">${index + 1}</span>
            <div>
              <span class="story-meta">${escapeHtml(localizeRegion(story.region, lang))} · ${escapeHtml(localizeTopic(story.topic, lang))}</span>
              <h3>${escapeHtml(displayTitle(story, lang))}</h3>
              <p>${escapeHtml(displaySummary(story, lang))}</p>
              ${
                story.url && !story.url.endsWith("#")
                  ? `<a href="${escapeAttr(story.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(lang, "originalLink"))}</a>`
                  : ""
              }
            </div>
          </article>
        `
      )
      .join("");

    els.analysis.innerHTML = (brief.analysis || [])
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
  } catch (error) {
    els.summary.textContent = lang === "zh" ? "找不到该日期的日报。" : "Brief not found for this date.";
    els.stories.innerHTML = "";
    els.analysis.innerHTML = "";
  }
}
