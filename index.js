import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const dataPath = path.join(process.cwd(), "saudi_heliports.json");
const heliports = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

/* ------------------ المسافة ------------------ */
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

/* ------------------ فلتر البحر (مهم جداً) ------------------ */
function isValidLand(lat, lon) {
  // حدود جدة التقريبية
  const minLat = 21.2;
  const maxLat = 21.9;
  const minLon = 38.9;
  const maxLon = 39.4;

  // إذا خارج نطاق جدة = مرفوض
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
    return false;
  }

  return true;
}

/* ------------------ تقييم بسيط واقعي ------------------ */
function getRisk(type) {
  if (type === "hospital" || type === "airport")
    return { level: "🟢 SAFE", note: "موقع رسمي مناسب للهبوط" };

  if (type === "open")
    return { level: "🟡 MEDIUM", note: "منطقة مفتوحة لكن تحتاج تحقق أرضي" };

  if (type === "industrial")
    return { level: "🟠 CAUTION", note: "منطقة صناعية - عوائق محتملة" };

  return { level: "🔴 RISK", note: "أرض غير مضمونة" };
}

/* ------------------ استقبال الموقع ------------------ */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const valid = heliports
    .filter((h) => isValidLand(h.lat, h.lon)) // يمنع البحر
    .map((h) => ({
      ...h,
      distance: getDistance(latitude, longitude, h.lat, h.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 أقرب مواقع الهبوط في جدة:\n\n`;

  valid.forEach((s, i) => {
    const risk = getRisk(s.type);

    reply += `${i + 1}- ${s.name}\n`;
    reply += `📍 ${s.distance.toFixed(2)} km\n`;
    reply += `⚠️ ${risk.level}\n`;
    reply += `📝 ${risk.note}\n\n`;
  });

  const keyboard = valid.map((s) => [
    {
      text: `فتح الموقع`,
      url: `https://www.google.com/maps?q=${s.lat},${s.lon}`,
    },
  ]);

  bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* ------------------ سيرفر ------------------ */
const app = express();
app.get("/", (req, res) => res.send("Bot running"));
app.listen(process.env.PORT || 3000);
