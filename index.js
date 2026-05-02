import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";

/* =========================
   TOKEN
========================= */
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";

/* =========================
   BOT
========================= */
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* =========================
   DATA
========================= */
const dataPath = path.join(process.cwd(), "saudi_heliports.json");
const heliports = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

/* =========================
   DISTANCE (Haversine)
========================= */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* =========================
   TERRAIN CLASSIFICATION (بسيط لكن ثابت)
========================= */
function classifyArea(distance) {
  if (distance < 5) {
    return { risk: "🟢 آمن", note: "منطقة مناسبة نسبياً للهبوط" };
  }
  if (distance < 15) {
    return { risk: "🟡 متوسط الخطورة", note: "أرض قد تكون غير مستوية" };
  }
  return { risk: "🔴 خطير", note: "تضاريس صعبة أو بعيدة عن العمران" };
}

/* =========================
   LOCATION HANDLER
========================= */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  if (!latitude || !longitude) {
    return bot.sendMessage(chatId, "❌ لم يتم استلام الموقع بشكل صحيح");
  }

  const results = heliports
    .map((h) => {
      const distance = getDistance(latitude, longitude, h.lat, h.lon);
      return {
        ...h,
        distance,
        ...classifyArea(distance),
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 أقرب 5 مواقع هبوط لك:\n\n`;

  results.forEach((r, i) => {
    reply +=
      `${i + 1}- ${r.name}\n` +
      `📍 ${r.city}\n` +
      `📏 ${r.distance.toFixed(2)} كم\n` +
      `⚠️ الحالة: ${r.risk}\n` +
      `📝 ${r.note}\n\n`;
  });

  const keyboard = results.map((r) => [
    {
      text: `📍 فتح الموقع`,
      url: `https://www.google.com/maps?q=${r.lat},${r.lon}`,
    },
  ]);

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* =========================
   EXPRESS (Render health check)
========================= */
const app = express();

app.get("/", (req, res) => {
  res.send("🚁 Bot is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
