import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let localSpots = [];
try { localSpots = JSON.parse(fs.readFileSync("./locations.json", "utf-8")); } catch (e) {}

function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// تحليل التربة والخطورة مع استبعاد العوائق
function analyzeSpot(tags = {}, type = "") {
    let info = { level: "⚪ غير محدد", note: "أرض مجهولة", risk: "متوسط" };
    const land = type || tags.natural || tags.landuse || "";

    if (tags.building && tags.building !== "no") {
        return { level: "🚫 غير مسموح", note: "هذا موقع مبنى - خطر جداً", risk: "حرج" };
    }

    if (land.includes("open") || land === "grass" || land === "field") {
        info = { level: "🟢 آمن", note: "أرض مسطحة تماماً (عشبية/فضاء)", risk: "منخفض" };
    } else if (land.includes("rough") || land === "bare_rock") {
        info = { level: "🔴 خطر/وعر", note: "تضاريس صخرية غير مستوية", risk: "عالي" };
    } else if (land.includes("sand") || land === "desert") {
        info = { level: "🟡 رملي", note: "تربة رملية ناعمة (تحقق من ثبات الأرجل)", risk: "متوسط" };
    }
    return info;
}

async function fetchSafeZones(lat, lon) {
    try {
        // Query يطلب بوضوح استبعاد المباني والتركيز على الفراغات
        const query = `[out:json][timeout:15];(way["natural"~"sand|bare_rock"](around:10000,${lat},${lon});way["landuse"~"grass|meadow|industrial"]["building"!~".*"](around:10000,${lat},${lon}););out center;`;
        const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 10000 });
        // فلتر إضافي للتأكد من خلو الموقع من أي وسم "مبنى"
        return (res.data.elements || []).filter(e => !e.tags.building);
    } catch (e) { return []; }
}

bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "🛠 جاري مسح التضاريس واستبعاد المباني والعوائق...");

    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev || "10m",
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeSpot({}, s.type)
    }));

    const osmData = await fetchSafeZones(latitude, longitude);
    const osmResults = osmData.map(e => ({
        name: "مساحة مفتوحة مكتشفة", lat: e.center.lat, lon: e.center.lon, elev: "متغير",
        dist: calcDist(latitude, longitude, e.center.lat, e.center.lon),
        ...analyzeSpot(e.tags)
    }));

    // استبعاد أي نتائج تم تصنيفها كـ "مبنى" أو "غير مسموح"
    const final = [...myResults, ...osmResults]
        .filter(p => p.level !== "🚫 غير مسموح")
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    let report = "🚁 **نتائج فحص مهابط الطوارئ:**\n\n";
    const buttons = [];

    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📏 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ الحالة: ${p.level}\n📉 الارتفاع (AMSL): ${p.elev}\n📝 طبيعة الأرض: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `📍 تفقد الموقع ${i+1} على الخريطة`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.get("/", (req, res) => res.send("System Active"));
app.listen(process.env.PORT || 3000);
