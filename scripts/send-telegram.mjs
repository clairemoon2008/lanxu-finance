import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const latest = JSON.parse(await fs.readFile(path.join(root, "data/latest.json"), "utf8"));

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  process.exit(1);
}

const message = [
  `岚序财经｜Lanxu Finance｜${latest.date}`,
  "",
  latest.summary,
  "",
  ...latest.topStories.slice(0, 5).map((story, index) => {
    return `${index + 1}. ${story.title}\n${story.region}｜${story.topic}\n${story.url}`;
  })
].join("\n");

const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text: message,
    disable_web_page_preview: false
  })
});

if (!response.ok) {
  throw new Error(`${response.status} ${await response.text()}`);
}

console.log("Telegram sent");
