import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

/* -----------------------------
   إعدادات البوت والبيانات
----------------------------- */
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// التأكد من وجود ملف المواقع وقراءته
let localLocations = [];
try {
    const data = fs.readFileSync("./locations.json", "utf-8");
    localLocations = JSON.parse(data);
} catch (err) {
    console.error("خطأ: لم يتم العثور على ملف locations.json أو الصيغة غير صحيحة.");
}

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
   تصنيف الخطورة
----------------------------- */
function classify(item) {
    if (typeof item === "string") {
        if (item === "open") return { level: "🟢 آمن", note: "أرض مفتوحة ومنبسطة" };
        if (item === "rough") return { level: "🟡 متوسط", note: "أرض وعرة/جبلية" };
        if (item === "industrial") return { level: "🔴 خطر", note: "منطقة صناعية" };
    }
    const tags = item || {};
    if (tags.natural === "bare_rock" || tags.natural === "scree")
        return { level: "🔴 خطر/وعر", note: "تضاريس جبلية حادة" };
    if (tags.landuse === "grass" || tags.landuse === "meadow")
        return { level: "🟢 آمن", note: "منطقة مفتوحة" };
    if (tags.landuse === "residential" || tags.highway)
        return { level: "🚫 خطر جداً", note: "منطقة سكنية أو طريق" };
    
    return { level: "⚪ غير محدد", note: "استطلع بصرياً" };
}

/* -----------------------------
   جلب البيانات العامة من OSM
----------------------------- */
async function getOsmZones(lat, lon) {
    try {
        const query = `[out:json];(way["landuse"~"grass|industrial|meadow|residential"](around:20000,${lat},${lon});way["natural"~"sand|bare_rock|scrub"](around:20000,${lat},${lon}););out center;`;
        const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 15000 });
        return res.data.elements || [];
    } catch (err) {
        return [];
    }
}

/* -----------------------------
   معالجة الموقع
----------------------------- */
bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "🔎 جاري البحث عن أقرب 5 مواقع...");

    const mySpots = localLocations.map(spot => ({
        name: spot.name,
        lat: spot.lat,
        lon: spot.lon,
        distance: getDistance(latitude, longitude, spot.lat, spot.lon),
        ...classify(spot.type)
    }));

    const osmData = await getOsmZones(latitude, longitude);
    const osmSpots = osmData.filter(p => p.center).map(p => ({
        name: "موقع مكتشف تلقائياً",
        lat: p.center.lat,
        lon: p.center.lon,
        distance: getDistance(latitude, longitude, p.center.lat, p.center.lon),
        ...classify(p.tags)
    }));

    // دمج وترتيب وأخذ أول 5
    const allResults = [...mySpots, ...osmSpots]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

    let text = "🚁 **أقرب 5 مواقع هبوط:**\n\n";
    const keyboard = [];

    allResults.forEach((p, i) => {
        text += `${i + 1}. **${p.name}**\n📏 ${p.distance.toFixed(2)} كم\n🛡 ${p.level}\n📝 ${p.note}\n───────────────\n`;
        keyboard.push([{ text: `🗺 موقع ${i + 1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
});

const app = express();
app.get("/", (req, res) => res.send("Bot Active"));
app.listen(process.env.PORT || 3000);
