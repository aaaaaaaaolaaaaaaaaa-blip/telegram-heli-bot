import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";

/* -----------------------------
   🔑 التوكن (حاطه لك مباشرة)
----------------------------- */
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* -----------------------------
   المسافة
----------------------------- */
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

/* -----------------------------
   جلب أراضي حقيقية
----------------------------- */
async function getZones(lat, lon) {
  try {
    const query = `
    [out:json];
    (
      way["landuse"="grass"](around:5000,${lat},${lon});
      way["landuse"="industrial"](around:5000,${lat},${lon});
      way["natural"="sand"](around:5000,${lat},${lon});
      way["natural"="bare_rock"](around:5000,${lat},${lon});
    );
    out center;
    `;

    const res = await axios.post(
      "https://overpass-api.de/api/interpreter",
      query,
      { headers: { "Content-Type": "text/plain" } }
    );

    return res.data.elements || [];
  } catch (e) {
    console.log("Overpass error:", e.message);
    return [];
  }
}

/* -----------------------------
   فلترة
----------------------------- */
function safe(tags = {}) {
  if (tags.landuse === "residential") return false;
  if (tags.building) return false;
  if (tags.highway) return false;
  return true;
}

/* -----------------------------
   تصنيف عربي
----------------------------- */
function classify(tags = {}) {
  if (tags.landuse === "industrial")
    return { level: "🟡 متوسط", note: "صناعي - تحقق قبل الهبوط" };

  if (tags.landuse === "grass")
    return { level: "🟢 مناسب", note: "أرض مفتوحة" };

  if (tags.natural === "sand")
    return { level: "🟡 رملي", note: "تأكد من ثبات الأرض" };

  return { level: "🔴 غير مناسب", note: "غير واضح" };
}

/* -----------------------------
   استقبال الموقع
----------------------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const data = await getZones(latitude, longitude);

  const results = data
    .filter((p) => safe(p.tags || {}))
    .map((p) => {
      if (!p.center) return null;

      const lat = p.center.lat;
      const lon = p.center.lon;

      return {
        lat,
        lon,
        distance: getDistance(latitude, longitude, lat, lon),
        ...classify(p.tags || {}),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (!results.length) {
    return bot.sendMessage(chatId, "🚨 لا توجد مناطق مناسبة قريبة");
  }

  let msgText = "🚁 أقرب مناطق هبوط:\n\n";

  results.forEach((p, i) => {
    msgText += `${i + 1}- ${p.distance.toFixed(2)} كم\n`;
    msgText += `${p.level}\n`;
    msgText += `${p.note}\n\n`;
  });

  const keyboard = results.map((p) => [
    {
      text: "🗺 عرض",
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`,
    },
  ]);

  bot.sendMessage(chatId, msgText, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* -----------------------------
   سيرفر Render
----------------------------- */
const app = express();

app.get("/", (req, res) => res.send("Bot running 🚁"));

app.listen(process.env.PORT || 3000);
