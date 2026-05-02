import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// قراءة ملف المواقع الخاص بك
const localLocations = JSON.parse(fs.readFileSync("./locations.json", "utf-8"));

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
   نظام التصنيف المطور
----------------------------- */
function classify(item) {
  // 1. تصنيف مواقعك الخاصة من ملف JSON
  if (typeof item === "string") {
    if (item === "open") return { level: "🟢 آمن", note: "أرض مفتوحة ومنبسطة" };
    if (item === "rough") return { level: "🟡 متوسط", note: "أرض وعرة/جبلية - تحتاج مهارة" };
    if (item === "industrial") return { level: "🔴 خطر", note: "منطقة صناعية - عوائق تقنية" };
  }

  // 2. تصنيف بيانات الخريطة العامة OSM
  const tags = item || {};
  
  // مناطق جبلية وصخرية (وعرة)
  if (tags.natural === "bare_rock" || tags.natural === "scree" || tags.natural === "peak")
    return { level: "🔴 خطر/وعر", note: "تضاريس صخرية أو جبلية حادة" };
    
  // مناطق عشبية أو رملية (آمنة/متوسطة)
  if (tags.landuse === "grass" || tags.landuse === "meadow")
    return { level: "🟢 آمن", note: "منطقة مفتوحة" };
  if (tags.natural === "sand")
    return { level: "🟡 متوسط", note: "أرض رملية - قد تكون غير ثابتة" };

  // مناطق سكنية أو طرق (خطيرة جداً)
  if (tags.landuse === "residential" || tags.highway)
    return { level: "🚫 خطر جداً", note: "منطقة سكنية أو طريق سريع - ممنوع الهبوط" };

  return { level: "⚪ غير مؤكد", note: "بيانات غير كافية - استطلع بصرياً" };
}

/* -----------------------------
   جلب البيانات من الخريطة (مع استبعاد البحر والطرق)
----------------------------- */
async function getOsmZones(lat, lon) {
  try {
    // زيادة القطر لضمان إيجاد نتائج واستبعاد الطرق والمياه
    const query = `
    [out:json];
    (
      way["landuse"~"grass|industrial|meadow|residential"](around:20000,${lat},${lon});
      way["natural"~"sand|bare_rock|scrub"](around:20000,${lat},${lon});
    );
    out center;`;
    
    const res = await axios.post("https://overpass-api.de/api/interpreter", query, { headers: { "Content-Type": "text/plain" }, timeout: 10000 });
    return res.data.elements || [];
  } catch (err) {
    return [];
  }
}

bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "🔎 جاري تحليل المنطقة وإيجاد أقرب 5 مواقع هبوط...");

  // 1. معالجة مواقعك الخاصة (بدون حد مسافة)
  const mySpots = localLocations.map(spot => ({
    name: spot.name,
    lat: spot.lat,
    lon: spot.lon,
    distance: getDistance(latitude, longitude, spot.lat, spot.lon),
    ...classify(spot.type)
  }));

  // 2. معالجة مواقع الخريطة
  const osmData = await getOsmZones(latitude, longitude);
  const osmSpots = osmData.filter(p => p.center).map(p => ({
    name: "موقع مكتشف من الخريطة",
    lat: p.center.lat,
    lon: p.center.lon,
    distance: getDistance(latitude, longitude, p.center.lat, p.center.lon),
    ...classify(p.tags)
  }));

  // 3. الدمج، الترتيب حسب المسافة، وأخذ أول 5 فقط
  const allResults = [...mySpots, ...osmSpots]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let responseText = "🚁 **أقرب 5 مواقع هبوط تم تحليلها:**\n\n";
  const keyboard = [];

  allResults.forEach((p, i) => {
    responseText += `${i + 1}. **${p.name}**\n`;
    responseText += `📏 المسافة: ${p.distance.toFixed(2)} كم\n`;
    responseText += `🛡 الحالة: ${p.level}\n`;
    responseText += `📝 ${p.note}\n`;
    responseText += `───────────────\n`;

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

const app = express();
app.get("/", (req, res) => res.send("Heli-Bot Active 🚁"));
app.listen(process.env.PORT || 3000);
