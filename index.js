import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";

/* -----------------------------
   🔑 توكن البوت
----------------------------- */
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* -----------------------------
   حساب المسافة
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
   جلب أراضي حقيقية من OSM
----------------------------- */
async function getRealZones(lat, lon) {
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
}

/* -----------------------------
   فلترة مناطق غير مناسبة
----------------------------- */
function isSafe(tags = {}) {
  if (tags.landuse === "residential") return false;
  if (tags.building) return false;
  if (tags.highway) return false;
  return true;
}

/* -----------------------------
   تقييم عربي
----------------------------- */
function classify(tags = {}) {
  if (tags.landuse === "industrial")
    return { level: "🟡 متوسط", note: "منطقة صناعية - تحقق قبل الهبوط" };

  if (tags.landuse === "grass")
    return { level: "🟢 مناسب", note: "أرض مفتوحة نسبياً" };

  if (tags.natural === "sand")
    return { level: "🟡 صحراوي", note: "أرض رملية تحتاج تقييم بصري" };

  return { level: "🔴 غير مناسب", note: "منطقة غير واضحة" };
}

/* -----------------------------
   استقبال موقع المستخدم
----------------------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const data = await getRealZones(latitude, longitude);

  const results = data
    .filter((p) => isSafe(p.tags || {}))
    .slice(0, 5)
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
    .sort((a, b) => a.distance - b.distance);

  if (!results.length) {
    return bot.sendMessage(
      chatId,
      "🚨 ما تم العثور على مناطق مناسبة قريبة"
    );
  }

  let reply = "🚁 أقرب مناطق هبوط محتملة (تحليل أرضي):\n\n";

  results.forEach((p, i) => {
    reply += `${i + 1}- ${p.distance.toFixed(2)} كم\n`;
    reply += `${p.level}\n`;
    reply += `${p.note}\n\n`;
  });

  const keyboard = results.map((p) => [
    {
      text: "🗺 عرض على الخريطة",
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`,
    },
  ]);

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* -----------------------------
   سيرفر Render
----------------------------- */
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running 🚁");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port " + PORT));
       
