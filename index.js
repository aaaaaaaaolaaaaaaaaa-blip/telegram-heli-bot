
    import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

// 1. إعدادات البوت والبيانات
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// قراءة ملف المواقع الخاص بك
const localLocations = JSON.parse(fs.readFileSync("./locations.json", "utf-8"));

/* -----------------------------
   دالة حساب المسافة
----------------------------- */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* -----------------------------
   تصنيف الخطورة (للمواقع العامة والمخططة)
----------------------------- */
function classify(typeOrTags) {
  // إذا كان من ملفك الخاص
  if (typeof typeOrTags === "string") {
    if (typeOrTags === "open") return { level: "🟢 آمن", note: "منطقة هبوط مخصصة ومفتوحة" };
    if (typeOrTags === "rough") return { level: "🟡 متوسط", note: "أرض وعرة - انتبه للعوائق الأرضية" };
    if (typeOrTags === "industrial") return { level: "🔴 خطر", note: "منطقة صناعية - كابلات وهياكل" };
  }
  
  // إذا كان من بيانات الخريطة العامة OSM
  const tags = typeOrTags || {};
  if (tags.landuse === "grass" || tags.landuse === "meadow") return { level: "🟢 آمن", note: "مساحة عشبية عامة" };
  if (tags.landuse === "industrial" || tags.landuse === "residential") return { level: "🔴 خطر", note: "منطقة مأهولة أو صناعية" };
  
  return { level: "⚪ غير محدد", note: "يرجى التحقق يدوياً عبر الخريطة" };
}

/* -----------------------------
   جلب البيانات العامة من OSM
----------------------------- */
async function getOsmZones(lat, lon) {
  try {
    const query = `[out:json];(way["landuse"~"grass|industrial|meadow"](around:3000,${lat},${lon}););out center;`;
    const res = await axios.post("https://overpass-api.de/api/interpreter", query, { headers: { "Content-Type": "text/plain" } });
    return res.data.elements || [];
  } catch (err) { return []; }
}

/* -----------------------------
   استقبال موقع المستخدم
----------------------------- */
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "🚁 جاري تحليل المنطقة المحيطة بك في جدة...");

  // 1. البحث في ملفك الخاص (locations.json)
  const mySpots = localLocations.map(spot => ({
    name: spot.name,
    lat: spot.lat,
    lon: spot.lon,
    distance: getDistance(latitude, longitude, spot.lat, spot.lon),
    ...classify(spot.type)
  })).filter(spot => spot.distance < 10); // عرض المواقع في نطاق 10 كم

  // 2. البحث في الخرائط العامة
  const osmData = await getOsmZones(latitude, longitude);
  const osmSpots = osmData.filter(p => p.center).map(p => ({
    name: "موقع عام مكتشف",
    lat: p.center.lat,
    lon: p.center.lon,
    distance: getDistance(latitude, longitude, p.center.lat, p.center.lon),
    ...classify(p.tags)
  }));

  // دمج وترتيب النتائج
  const allResults = [...mySpots, ...osmSpots]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (allResults.length === 0) {
    return bot.sendMessage(chatId, "📍 لم يتم العثور على مواقع هبوط قريبة معروفة.");
  }

  let responseText = "📋 **تقرير مواقع الهبوط القريبة:**\n\n";
  const keyboard = [];

  allResults.forEach((p, i) => {
    responseText += `${i + 1}. **${p.name}**\n`;
    responseText += `📏 المسافة: ${p.distance.toFixed(2)} كم\n`;
    responseText += `🛡 الحالة: ${p.level}\n`;
    responseText += `📝 ${p.note}\n\n`;

    keyboard.push([{
      text: `🗺 فتح موقع ${i + 1} على Google Maps`,
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`
    }]);
  });

  await bot.sendMessage(chatId, responseText, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
});

// تشغيل السيرفر لـ Render
const app = express();
app.get("/", (req, res) => res.send("Heli-Jeddah Bot is Running 🚁"));
app.listen(process.env.PORT || 3000);
