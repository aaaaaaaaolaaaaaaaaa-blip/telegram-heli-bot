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

function analyzeSpot(tags = {}, manualType = "") {
    // 1. فحص العوائق القاتلة (طرق، مباني، أعمدة كهرباء)
    const dangerTags = ['highway', 'building', 'power', 'aeroway', 'residential'];
    for (let tag of dangerTags) {
        if (tags[tag] || tags.landuse === 'residential') {
            return { level: "🚫 منطقة محظورة", note: "عائق صلب (مبنى/طريق/أسلاك)", risk: "حرج" };
        }
    }

    // 2. تحليل طبيعة الأرض الحقيقية
    const land = manualType || tags.natural || tags.landuse || tags.surface || "";
    
    if (land.includes("rock") || land.includes("cliff") || land.includes("peak") || land === "rough") {
        return { level: "🔴 خطر جداً/وعر", note: "تضاريس جبلية، صخور حادة، عدم استواء"، risk: "عالي" };
    }
    if (land.includes("sand") || land === "desert") {
        return { level: "🟡 رملي", note: "تربة ناعمة، كثبان رملية، خطر الغريز", risk: "متوسط" };
    }
    if (land === "open" || land === "grass" || land === "brownfield") {
        return { level: "🟢 منطقة فضاء", note: "أرض مستوية نسبياً، خالية من العوائق"، risk: "منخفض" };
    }

    return { level: "⚪ غير مؤكد", note: "يجب المسح البصري قبل الهبوط", risk: "مجهول" };
}

async function fetchSafeZones(lat, lon) {
    try {
        // Query يستبعد بوضوح الطرق (highway) والمباني (building)
        const query = `[out:json][timeout:20];(node["natural"~"sand|bare_rock"](around:10000,${lat},${lon});way["landuse"~"brownfield|grass"]["highway"!~".*"]["building"!~".*"](around:10000,${lat},${lon}););out center;`;
        const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 15000 });
        return res.data.elements || [];
    } catch (e) { return []; }
}

bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "⚠️ جاري فحص الرادار وتحليل العوائق الصعبة...");

    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev,
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeSpot({}, s.type)
    }));

    const osmData = await fetchSafeZones(latitude, longitude);
    const osmResults = osmData.map(e => ({
        name: "موقع طبيعي مرصود", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon, elev: "متغير",
        dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
        ...analyzeSpot(e.tags)
    }));

    const final = [...myResults, ...osmResults]
        .filter(p => !p.level.includes("🚫")) // حذف الطرق والمباني فوراً
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    let report = "🚁 **تقرير فحص المهابط الصارم:**\n\n";
    const buttons = [];

    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📏 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ التصنيف: ${p.level}\n⛰️ الارتفاع: ${p.elev}\n📝 الملاحظة: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `📍 معاينة الموقع ${i+1} بدقة`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.get("/", (req, res) => res.send("Security System Active"));
app.listen(process.env.PORT || 3000);
