import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

// 🔑 التوكن الخاص بك
const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// 📄 تحميل البيانات المحلية
let localSpots = [];
try {
    localSpots = JSON.parse(fs.readFileSync("./locations.json", "utf-8"));
} catch (e) { console.error("خطأ في قراءة locations.json"); }

// 📐 دالة حساب المسافة
function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 🛡️ نظام تحليل الخطورة والتربة
function analyzeSpot(tags = {}, type = "") {
    let info = { level: "⚪ غير محدد", note: "أرض مجهولة", risk: "متوسط" };
    
    const land = type || tags.natural || tags.landuse || "";

    if (land.includes("open") || land === "grass") {
        info = { level: "🟢 آمن", note: "أرض مستوية، تربة متماسكة (عشب/طين)", risk: "منخفض" };
    } else if (land.includes("rough") || land === "bare_rock") {
        info = { level: "🔴 خطر/وعر", note: "تضاريس جبلية صخرية، غير مستوية", risk: "عالي" };
    } else if (land.includes("sand") || land === "desert") {
        info = { level: "🟡 رملي", note: "كثبان رملية، تربة ناعمة قد تغرز", risk: "متوسط" };
    } else if (land.includes("industrial")) {
        info = { level: "🔴 خطر", note: "منطقة منشآت، عوائق وكابلات", risk: "عالي" };
    }
    return info;
}

// 🌐 جلب بيانات الخريطة مع استبعاد السكني (Residential)
async function fetchSafeZones(lat, lon) {
    try {
        const query = `[out:json][timeout:15];(way["natural"~"sand|bare_rock|scrub"](around:15000,${lat},${lon});way["landuse"~"grass|meadow"](around:15000,${lat},${lon}););out center;`;
        const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 10000 });
        return (res.data.elements || []).filter(e => !e.tags.landuse?.includes("residential"));
    } catch (e) { return []; }
}

// 🚀 استقبال الموقع
bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "🔍 جاري فحص الرادار وتحليل التضاريس المحيطة...");

    // 1. معالجة المواقع المحلية
    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev || "غير معروف",
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeSpot({}, s.type)
    }));

    // 2. جلب ومعالجة مواقع الخريطة
    const osmData = await fetchSafeZones(latitude, longitude);
    const osmResults = osmData.map(e => ({
        name: "موقع طبيعي مكتشف", lat: e.center.lat, lon: e.center.lon, elev: "بناءً على التضاريس",
        dist: calcDist(latitude, longitude, e.center.lat, e.center.lon),
        ...analyzeSpot(e.tags)
    }));

    // 3. الترتيب واختيار التوب 5
    const final = [...myResults, ...osmResults].sort((a, b) => a.dist - b.dist).slice(0, 5);

    let report = "🚁 **تقرير تحليل الهبوط المباشر:**\n\n";
    const buttons = [];

    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ الحالة: ${p.level}\n⛰️ الارتفاع التقريبي: ${p.elev}\n📝 الملاحظة: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🗺️ فتح موقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

// تشغيل السيرفر لـ Render
const app = express();
app.get("/", (req, res) => res.send("Heli-Bot Online"));
app.listen(process.env.PORT || 3000);
