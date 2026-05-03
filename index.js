import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const TELEGRAM_TOKEN = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// تحميل المواقع مع التأكد من وجود الملف
let localSpots = [];
if (fs.existsSync("./locations.json")) {
    try {
        localSpots = JSON.parse(fs.readFileSync("./locations.json", "utf-8"));
    } catch (e) { console.error("خطأ في ملف JSON"); }
}

function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function analyzeSpot(tags = {}, manualType = "") {
    // استبعاد مطلق للطرق والمباني
    if (tags.highway || tags.building || tags.landuse === 'residential') {
        return { level: "🚫 محظور", note: "عائق (طريق أو مبنى)", risk: "حرج", valid: false };
    }

    const land = manualType || tags.natural || tags.landuse || "";
    if (land.includes("rough") || land.includes("rock")) {
        return { level: "🔴 خطر/وعر", note: "تضاريس صخرية جبلية غير مستوية", risk: "عالي", valid: true };
    }
    if (land.includes("sand")) {
        return { level: "🟡 رملي", note: "تربة ناعمة/صحراوية", risk: "متوسط", valid: true };
    }
    return { level: "🟢 فضاء", note: "أرض مستوية خالية", risk: "منخفض", valid: true };
}

async function fetchSafeZones(lat, lon) {
    try {
        const query = `[out:json][timeout:15];(node(around:5000,${lat},${lon})["natural"~"sand|bare_rock"];way(around:5000,${lat},${lon})["landuse"~"brownfield|grass"];);out center;`;
        const url = "https://overpass-api.de/api/interpreter";
        const res = await axios.get(url, { params: { data: query }, timeout: 10000 });
        return res.data.elements || [];
    } catch (e) { return []; }
}

bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "🛠 جاري فحص الإحداثيات واستبعاد العوائق...");

    // معالجة المواقع المحلية
    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev,
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeSpot({}, s.type)
    }));

    // جلب بيانات الخريطة
    const osmData = await fetchSafeZones(latitude, longitude);
    const osmResults = osmData.map(e => ({
        name: "منطقة مكتشفة", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon, elev: "متغير",
        dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
        ...analyzeSpot(e.tags)
    }));

    // التصفية والترتيب
    const final = [...myResults, ...osmResults]
        .filter(p => p.valid === true) // استبعاد أي شيء محظور
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    if (final.length === 0) {
        return bot.sendMessage(chatId, "⚠️ لم يتم العثور على مناطق آمنة تماماً في هذا النطاق.");
    }

    let report = "🚁 **تقرير فحص المهابط الميداني:**\n\n";
    const buttons = [];

    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ التصنيف: ${p.level}\n⛰️ الارتفاع: ${p.elev}\n📝 طبيعة الأرض: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🗺️ موقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.get("/", (req, res) => res.send("Bot is Live"));
app.listen(process.env.PORT || 3000);
