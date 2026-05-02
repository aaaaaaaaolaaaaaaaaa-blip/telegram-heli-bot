import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

// 1. الإعدادات الأساسية
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// 2. قراءة ملف المواقع المحلي (بأمان)
let localLocations = [];
try {
  const rawData = fs.readFileSync("./locations.json", "utf-8");
  localLocations = JSON.parse(rawData);
} catch (err) {
  console.error("Critical Error: locations.json not found or corrupted");
}

// 3. دالة حساب المسافة
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// 4. تصنيف الحالة
function classify(typeOrTags) {
  if (typeof typeOrTags === "string") {
    if (typeOrTags === "open") return { level: "🟢 آمن", note: "أرض مفتوحة ومنبسطة" };
    if (typeOrTags === "rough") return { level: "🟡 متوسط", note: "أرض وعرة أو جبلية" };
    if (typeOrTags === "industrial") return { level: "🔴 خطر", note: "منطقة صناعية - عوائق تقنية" };
  }
  const tags = typeOrTags || {};
  if (tags.landuse === "grass") return { level: "🟢 آمن", note: "منطقة عشبية" };
  if (tags.natural === "bare_rock") return { level: "🔴 خطر", note: "جبل أو تضاريس صخرية" };
  return { level: "⚪ غير مؤكد", note: "يرجى التحقق بصرياً" };
}

// 5. جلب بيانات OSM (نطاق واسع 30 كم)
async function getOsmData(lat, lon) {
  try {
    const query = `[out:json];(way["landuse"~"grass|industrial"](around:30000,${lat},${lon});way["natural"~"bare_rock|sand"](around:30000,${lat},${lon}););out center;`;
    const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 10000 });
    return res.data.elements || [];
  } catch (err) {
    return [];
  }
}

// 6. التعامل مع إرسال الموقع
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "⏳ جاري جلب أقرب 5 مواقع هبوط...");

  // دمج مواقعك الخاصة
  const mySpots = localLocations.map(s => ({
    name: s.name, lat: s.lat, lon: s.lon,
    distance: getDistance(latitude, longitude, s.lat, s.lon),
    ...classify(s.type)
  }));

  // جلب مواقع OSM
  const osmElements = await getOsmData(latitude, longitude);
  const osmSpots = osmElements.filter(e => e.center).map(e => ({
    name: "موقع مكتشف من الخريطة",
    lat: e.center.lat, lon: e.center.lon,
    distance: getDistance(latitude, longitude, e.center.lat, e.center.lon),
    ...classify(e.tags)
  }));

  // الترتيب والاختيار
  const finalResults = [...mySpots, ...osmSpots]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (finalResults.length === 0) {
    return bot.sendMessage(chatId, "❌ لم يتم العثور على أي نتائج.");
  }

  let text = "🚁 **تقرير مواقع الهبوط القريبة:**\n\n";
  const keyboard = [];

  finalResults.forEach((p, i) => {
    text += `${i + 1}. **${p.name}**\n📍 المسافة: ${p.distance.toFixed(2)} كم\n🛡 الحالة: ${p.level}\n📝 ${p.note}\n───────────────\n`;
    keyboard.push([{ text: `🗺 فتح موقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
  });

  await bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
});

// 7. سيرفر بسيط لمنع Render من التوقف
const app = express();
app.get("/", (req, res) => res.send("Bot is Alive"));
app.listen(process.env.PORT || 3000);
