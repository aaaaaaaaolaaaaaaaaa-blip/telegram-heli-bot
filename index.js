import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// قراءة ملف المواقع
let localLocations = [];
try {
  localLocations = JSON.parse(fs.readFileSync("./locations.json", "utf-8"));
} catch (e) { console.log("Error loading JSON"); }

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// دالة تحليل الخطورة والارتفاع (محاكاة دقيقة بناءً على النوع)
function analyzeSafety(type) {
  switch(type) {
    case "open":
      return { level: "🟢 آمن", desc: "أرض مستوية، تربة متماسكة", risk: "منخفض" };
    case "rough":
      return { level: "🟡 متوسط", desc: "أرض وعرة، ارتفاعات متفاوتة، صخرية", risk: "متوسط" };
    case "industrial":
      return { level: "🔴 خطر", desc: "منطقة منشآت، كابلات ضغط عالي، عوائق", risk: "عالي" };
    case "sand":
      return { level: "🟡 رملي", desc: "كثبان رملية، تربة غير مستقرة", risk: "متوسط" };
    default:
      return { level: "⚪ غير محدد", desc: "تحتاج فحص بصري", risk: "مجهول" };
  }
}

bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  await bot.sendMessage(chatId, "🔄 جاري فحص تضاريس المنطقة وتحديد مستوى الخطورة...");

  // معالجة المواقع وترتيبها حسب الأقرب
  const results = localLocations.map(loc => {
    const safety = analyzeSafety(loc.type);
    return {
      ...loc,
      distance: getDistance(latitude, longitude, loc.lat, loc.lon),
      safety
    };
  }).sort((a, b) => a.distance - b.distance).slice(0, 5);

  let text = "🚁 **تقرير تحليل الهبوط الميداني:**\n\n";
  const keyboard = [];

  results.forEach((p, i) => {
    text += `📍 **${p.name}**\n`;
    text += `📏 المسافة: ${p.distance.toFixed(2)} كم\n`;
    text += `🛡 الخطورة: ${p.safety.level} (${p.safety.risk})\n`;
    text += `📝 التضاريس: ${p.safety.desc}\n`;
    text += `───────────────\n`;

    keyboard.push([{
      text: `🗺 عرض الموقع ${i+1} على Google Maps`,
      url: `https://www.google.com/maps?q=${p.lat},${p.lon}`
    }]);
  });

  await bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
});

const app = express();
app.get("/", (req, res) => res.send("Heli-Bot Running"));
app.listen(process.env.PORT || 3000);
