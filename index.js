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

/* ------------------ جلب الارتفاع ------------------ */
async function getElevation(lat, lon) {
  try {
    const res = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`
    );
    const data = await res.json();
    return data.results[0].elevation;
  } catch {
    return 0;
  }
}

/* ------------------ تقييم الموقع ------------------ */
function getRisk(elevation) {
  if (elevation < 10) return { level: "🟢 SAFE", note: "سطح مستوٍ مناسب للهبوط" };
  if (elevation < 100) return { level: "🟡 MEDIUM", note: "أرض غير مستوية جزئياً" };
  return { level: "🔴 DANGEROUS", note: "تضاريس مرتفعة / غير مناسبة" };
}

/* ------------------ استقبال الموقع ------------------ */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const sorted = heliports
    .map((h) => ({
      ...h,
      distance: getDistance(latitude, longitude, h.lat, h.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 أقرب مناطق الهبوط:\n\n`;

  for (const s of sorted) {
    const elevation = await getElevation(s.lat, s.lon);
    const risk = getRisk(elevation);

    reply += `📍 ${s.name}\n`;
    reply += `📏 ${s.distance.toFixed(2)} km\n`;
    reply += `🏔 ارتفاع: ${elevation} m\n`;
    reply += `⚠️ الحالة: ${risk.level}\n`;
    reply += `📝 ${risk.note}\n\n`;
  }

  const keyboard = sorted.map((s) => [
    {
      text: `فتح ${s.name}`,
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
