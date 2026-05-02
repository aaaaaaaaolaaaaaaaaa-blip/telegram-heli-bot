import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* ---------------- المسافة ---------------- */
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

/* ---------------- جلب بيانات آمنة ---------------- */
async function getZones(lat, lon) {
  try {
    const query = `
    [out:json];
    (
      way["landuse"="grass"](around:5000,${lat},${lon});
      way["landuse"="industrial"](around:5000,${lat},${lon});
      way["natural"="sand"](around:5000,${lat},${lon});
    );
    out center;
    `;

    const res = await axios.post(
      "https://overpass-api.de/api/interpreter",
      query,
      { headers: { "Content-Type": "text/plain" } }
    );

    return res.data.elements || [];
  } catch (err) {
    console.log("Overpass error:", err.message);
    return [];
  }
}

/* ---------------- فلترة ---------------- */
function isValid(tags = {}) {
  if (tags.landuse === "residential") return false;
  if (tags.building) return false;
  if (tags.highway) return false;
  return true;
}

/* ---------------- تصنيف ---------------- */
function classify(tags = {}) {
  if (tags.landuse === "industrial")
    return { level: "🟡 صناعي", note: "تحقق من العوائق" };

  if (tags.landuse === "grass")
    return { level: "🟢 مناسب", note: "أرض مفتوحة" };

  if (tags.natural === "sand")
    return { level: "🟡 رملي", note: "أرض تحتاج تقييم بصري" };

  return { level: "🔴 غير مناسب", note: "غير واضح" };
}

/* ---------------- استقبال الموقع ---------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const data = await getZones(latitude, longitude);

  const results = data
    .filter((p) => p.center && isValid(p.tags || {}))
    .map((p) => {
      const lat = p.center.lat;
      const lon = p.center.lon;

      return {
        lat,
        lon,
        distance: getDistance(latitude, longitude, lat, lon),
        ...classify(p.tags || {}),
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (results.length === 0) {
    return bot.sendMessage(
      chatId,
      "🚨 ما تم العثور على مناطق مناسبة قريبة"
    );
  }

  let text = "🚁 أقرب مناطق هبوط:\n\n";

  results.forEach((p, i) => {
    text += `${i + 1}- ${p.distance.toFixed(2)} كم\n`;
    text += `${p.level}\n`;
    text += `${p.note}\n\n`;
  });

  const keyboard = results.map((p) => [
    {
      text: "🗺 عرض الخريطة",
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`,
    },
  ]);

  bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* ---------------- سيرفر ---------------- */
const app = express();
app.get("/", (req, res) => res.send("Bot running 🚁"));

app.listen(process.env.PORT || 3000);
