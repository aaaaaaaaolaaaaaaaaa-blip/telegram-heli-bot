import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";

/* -----------------------------
   🔑 التوكن
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
   جلب بيانات حقيقية من OSM
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
  } catch (err) {
    console.log("OSM error:", err.message);
    return [];
  }
}

/* -----------------------------
   تصنيف المنطقة
----------------------------- */
function classify(tags = {}) {
  if (tags.landuse === "grass")
    return { level: "🟢 مناسب", note: "أرض مفتوحة" };

  if (tags.landuse === "industrial")
    return { level: "🟡 متوسط", note: "منطقة صناعية - انتبه" };

  if (tags.natural === "sand")
    return { level: "🟡 رملي", note: "أرض رملية - تحقق بصري" };

  return { level: "🔴 خطير", note: "غير معروف - احتمال عوائق" };
}

/* -----------------------------
   BOT
----------------------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const data = await getZones(latitude, longitude);

  let results = data
    .filter((p) => p.center)
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

  /* -----------------------------
     Fallback لو ما فيه بيانات
  ----------------------------- */
  if (results.length === 0) {
    results = [
      {
        lat: latitude + 0.01,
        lon: longitude + 0.01,
        distance: 1.2,
        level: "⚠️ غير مؤكد",
        note: "لا توجد بيانات دقيقة - تحقق بصري مطلوب",
      },
    ];
  }

  let text = "🚁 تقرير مناطق الهبوط:\n\n";

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

  await bot.sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* -----------------------------
   سيرفر Render
----------------------------- */
const app = express();

app.get("/", (req, res) => {
  res.send("Heli Bot Running 🚁");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on " + PORT));
