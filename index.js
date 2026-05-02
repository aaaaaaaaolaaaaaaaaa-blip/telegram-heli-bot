import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

// 1. الإعدادات الأساسية
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// 2. قراءة ملف المواقع المحلي
let localLocations = [];
try {
  const rawData = fs.readFileSync("./locations.json", "utf-8");
  localLocations = JSON.parse(rawData);
  console.log("✅ تم تحميل " + localLocations.length + " موقع من الملف المحلي");
} catch (err) {
  console.error("❌ خطأ في ملف locations.json");
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
    if (typeOrTags === "industrial") return { level: "🔴 خطر", note: "منطقة صناعية - عوائق" };
  }
  const tags = typeOrTags || {};
  if (tags.landuse === "grass") return { level: "🟢 آمن", note: "منطقة عشبية" };
  if (tags.natural === "bare_rock") return { level: "🔴 خطر", note: "تضاريس صخرية/جبلية" };
  return { level: "⚪ غير مؤكد", note: "يرجى التحقق بصرياً" };
}

// 5. جلب بيانات OSM (مع مهلة قصيرة لضمان عدم التعليق)
async function getOsmData(lat, lon) {
  try {
    const query = `[out:json][timeout:10];(way["landuse"~"grass|industrial"](around:10000,${lat},${lon});way["natural"~"bare_rock|sand"](around:10000,${lat},${lon}););out center;`;
    const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 8000 });
    return res.data.elements || [];
  } catch (err) {
    console.log("⚠️ فشل جلب بيانات OSM، سيتم الاعتماد على المواقع المحلية فقط.");
    return [];
  }
}

// 6. المعالجة الأساسية
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "🚁 جاري تحليل أقرب المواقع لك...");

  // أ) حساب المسافة لكل المواقع في ملفك الخاص أولاً (هذه لا تفشل أبداً)
  const mySpots = localLocations.map(s => ({
    name: s.name, 
    lat: s.lat, 
    lon: s.lon,
    distance: getDistance(latitude, longitude, s.lat, s.lon),
    ...classify(s.type)
  }));

  // ب) محاولة جلب بيانات إضافية من الخريطة
  const osmElements = await getOsmData(latitude, longitude);
  const osmSpots = osmElements.filter(e => e.center).map(e => ({
    name: "موقع مكتشف من الخريطة",
    lat: e.center.lat, 
    lon: e.center.lon,
    distance: getDistance(latitude, longitude, e.center.lat, e.center.lon),
    ...classify(e.tags)
  }));

  // ج) دمج النتائج وترتيبها من الأقرب للأبعد
  const finalResults = [...mySpots, ...osmSpots]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5); // أخذ أقرب 5 دائماً

  // د) تنسيق الرسالة
  let text = "🚁 **أقرب 5 مواقع هبوط إليك:**\n\n";
  const keyboard = [];

  finalResults.forEach((p, i) => {
    text += `${i + 1}. **${p.name}**\n📍 البعد: ${p.distance.toFixed(2)} كم\n🛡 الحالة: ${p.level}\n📝 ${p.note}\n───────────────\n`;
    keyboard.push([{ text: `🗺 فتح موقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
  });

  await bot.sendMessage(chatId, text, { 
    parse_mode: "Markdown", 
    reply_markup: { inline_keyboard: keyboard } 
  });
});

// 7. تشغيل السيرفر
const app = express();
app.get("/", (req, res) => res.send("Bot is Active 🚁"));
app.listen(process.env.PORT || 3000);
