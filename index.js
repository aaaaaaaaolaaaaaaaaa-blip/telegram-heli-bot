import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";

// ملاحظة أمنية: يفضل دائماً استخدام process.env.TELEGRAM_TOKEN في Render
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* -----------------------------
   حساب المسافة (Haversine Formula)
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
      way["landuse"="meadow"](around:5000,${lat},${lon});
      way["landuse"="industrial"](around:5000,${lat},${lon});
      way["landuse"="residential"](around:5000,${lat},${lon});
      way["natural"="sand"](around:5000,${lat},${lon});
      way["natural"="scrub"](around:5000,${lat},${lon});
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
    console.error("OSM error:", err.message);
    return [];
  }
}

/* -----------------------------
   تصنيف مستوى الخطورة
----------------------------- */
function classify(tags = {}) {
  // مناطق آمنة
  if (tags.landuse === "grass" || tags.landuse === "meadow")
    return { level: "🟢 آمن", note: "منطقة عشبية مفتوحة ومسطحة." };
  
  // مناطق متوسطة
  if (tags.natural === "sand")
    return { level: "🟡 متوسط", note: "أرض رملية - قد تعيق الهبوط السلس." };
  if (tags.natural === "scrub")
    return { level: "🟡 متوسط", note: "منطقة شجيرات - تحقق من الارتفاع." };

  // مناطق خطرة
  if (tags.landuse === "industrial")
    return { level: "🔴 خطر", note: "منطقة صناعية - عوائق وهياكل معدنية." };
  if (tags.landuse === "residential")
    return { level: "🔴 خطر", note: "منطقة سكنية - ازدحام ومباني." };

  return { level: "⚪ غير محدد", note: "بيانات غير كافية - يلزم الاستطلاع البصري." };
}

/* -----------------------------
   التعامل مع الرسائل
----------------------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "🔎 جاري البحث عن أقرب مواقع الهبوط وتقييمها...");

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

  if (results.length === 0) {
    return bot.sendMessage(chatId, "⚠️ عذراً، لم أجد مواقع معروفة في نطاق 5 كم. يرجى توخي الحذر.");
  }

  let text = "🚁 **تقرير تحليل مواقع الهبوط القريبة:**\n\n";
  const keyboard = [];

  results.forEach((p, i) => {
    text += `📍 **الموقع ${i + 1}**\n`;
    text += `📏 المسافة: ${p.distance.toFixed(2)} كم\n`;
    text += `🛡 الحالة: ${p.level}\n`;
    text += `📝 ملاحظة: ${p.note}\n`;
    text += `───────────────\n`;

    keyboard.push([{
      text: `🗺 فتح الموقع ${i + 1} على قوقل ماب`,
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`
    }]);
  });

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard },
  });
});

/* -----------------------------
   سيرفر الويب لـ Render
----------------------------- */
const app = express();
app.get("/", (req, res) => res.send("Heli-Safe Bot is Active 🚁"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
