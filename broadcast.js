const DATA_URL = "./data/latest.json";

const state = {
  script: null,
  queue: [],
  currentIndex: -1,
  speaking: false,
  paused: false,
  utterance: null,
};

const els = {
  anchor: document.getElementById("anchor"),
  anchorName: document.getElementById("anchorName"),
  anchorMouth: document.getElementById("anchorMouth"),
  waveBars: document.getElementById("waveBars"),
  broadcastDate: document.getElementById("broadcastDate"),
  segmentTitle: document.getElementById("segmentTitle"),
  teleprompterText: document.getElementById("teleprompterText"),
  scriptList: document.getElementById("scriptList"),
  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  stopBtn: document.getElementById("stopBtn"),
  tipText: document.getElementById("tipText"),
};

init();

async function init() {
  bindControls();
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
    const data = await res.json();
    state.script = data.broadcastScript || buildFallbackScript(data);
    renderScript(state.script);
    els.broadcastDate.textContent = state.script.date || data.date || "--";
    els.anchorName.textContent = state.script.anchorName || "岚序";
    els.teleprompterText.textContent = state.script.intro || "点击下方按钮开始播报。";
    buildQueue(state.script);
  } catch (err) {
    els.teleprompterText.textContent = "加载播报稿失败，请检查 data/latest.json 是否存在。";
    els.tipText.textContent = String(err.message || err);
  }
}

function buildFallbackScript(data) {
  const stories = (data.topStories || []).slice(0, 5);
  return {
    anchorName: "岚序",
    date: data.date,
    headline: data.headline,
    intro: `各位观众大家好，欢迎收看岚序财经。${data.summary || ""}`,
    segments: stories.map((story, i) => ({
      title: story.titleZh || story.title,
      text: `第${i + 1}条，${story.region || ""}${story.titleZh || story.title}。${story.summaryZh || story.summary || ""}`,
    })),
    outro: "感谢收看岚序财经，我们明天见。",
  };
}

function buildQueue(script) {
  state.queue = [
    { title: "开场", text: script.intro },
    ...(script.segments || []).map((s) => ({ title: s.title, text: s.text })),
    { title: "结束", text: script.outro },
  ].filter((item) => item.text);
}

function renderScript(script) {
  els.scriptList.innerHTML = "";
  const items = [
    { title: "开场", text: script.intro },
    ...(script.segments || []),
    { title: "结束", text: script.outro },
  ].filter((item) => item.text);

  items.forEach((item, index) => {
    const node = document.createElement("article");
    node.className = "script-item";
    node.dataset.index = String(index);
    node.innerHTML = `<h4>${escapeHtml(item.title || "播报")}</h4><p>${escapeHtml(item.text)}</p>`;
    els.scriptList.appendChild(node);
  });
}

function bindControls() {
  els.playBtn.addEventListener("click", startBroadcast);
  els.pauseBtn.addEventListener("click", togglePause);
  els.stopBtn.addEventListener("click", stopBroadcast);
}

function startBroadcast() {
  if (!state.queue.length) return;
  stopSpeechOnly();
  state.speaking = true;
  state.paused = false;
  state.currentIndex = -1;
  updateControls(true);
  speakNext();
}

function togglePause() {
  if (!state.speaking) return;
  state.paused = !state.paused;
  if (state.paused) {
    window.speechSynthesis.pause();
    setSpeakingVisual(false);
    els.pauseBtn.textContent = "▶ 继续";
  } else {
    window.speechSynthesis.resume();
    setSpeakingVisual(true);
    els.pauseBtn.textContent = "⏸ 暂停";
  }
}

function stopBroadcast() {
  stopSpeechOnly();
  state.speaking = false;
  state.paused = false;
  state.currentIndex = -1;
  updateControls(false);
  setSpeakingVisual(false);
  highlightSegment(-1);
  els.segmentTitle.textContent = "已停止";
}

function stopSpeechOnly() {
  window.speechSynthesis.cancel();
  state.utterance = null;
}

function speakNext() {
  if (!state.speaking || state.paused) return;

  state.currentIndex += 1;
  if (state.currentIndex >= state.queue.length) {
    finishBroadcast();
    return;
  }

  const segment = state.queue[state.currentIndex];
  highlightSegment(state.currentIndex);
  els.segmentTitle.textContent = segment.title || "播报中";
  els.teleprompterText.textContent = segment.text;

  if (!("speechSynthesis" in window)) {
    els.tipText.textContent = "当前环境不支持语音合成，请改用 Chrome 或系统浏览器打开。";
    finishBroadcast();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(segment.text);
  utterance.lang = "zh-CN";
  utterance.rate = 0.95;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find((v) => v.lang.includes("zh"));
  if (zhVoice) utterance.voice = zhVoice;

  utterance.onstart = () => setSpeakingVisual(true);
  utterance.onend = () => {
    setSpeakingVisual(false);
    setTimeout(speakNext, 350);
  };
  utterance.onerror = () => {
    setSpeakingVisual(false);
    els.tipText.textContent = "语音播报失败，可能是微信内置浏览器限制。建议在浏览器中打开本页。";
    finishBroadcast();
  };

  state.utterance = utterance;
  window.speechSynthesis.speak(utterance);
}

function finishBroadcast() {
  state.speaking = false;
  state.paused = false;
  updateControls(false);
  setSpeakingVisual(false);
  els.segmentTitle.textContent = "播报完成";
  els.teleprompterText.textContent = state.script?.headline || "今日播报已结束。";
}

function updateControls(active) {
  els.playBtn.disabled = active;
  els.pauseBtn.disabled = !active;
  els.stopBtn.disabled = !active;
  els.pauseBtn.textContent = "⏸ 暂停";
}

function setSpeakingVisual(on) {
  els.anchor.classList.toggle("speaking", on);
  els.waveBars.classList.toggle("active", on);
}

function highlightSegment(index) {
  [...els.scriptList.children].forEach((node, i) => {
    node.classList.toggle("active", i === index);
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
