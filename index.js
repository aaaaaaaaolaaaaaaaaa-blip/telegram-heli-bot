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

function analyzeSpot(tags = {}, type = "") {
    // إذا وجدنا أي تلميح لمبنى أو منطقة سكنية، نرفضها فوراً
    if (tags.building || tags.landuse === "residential" || tags.amenity) {
        return { level: "🚫 محظور", note: "منطقة سكنية/مباني", risk: "حرج" };
    }

    const land = type || tags.natural || tags.landuse || "";
    if (land === "open" || land === "grass" || land === "sand") {
        return { level: "🟢 آمن", note: "أرض مفتوحة خالية من العوائق", risk: "منخفض" };
    } else if (land === "rough" || land === "bare_rock") {
        return { level: "🔴 خطر", note: "تضاريس صخرية/جبلية", risk: "عالي" };
    }
    return { level: "🟡 متوسط", note: "تحقق بصري من العوائق", risk: "متوسط" };
}

async function fetchSafeZones(lat, lon) {
    try {
        // Query جديد يركز فقط على الأراضي الفضاء (vacant) والطبيعية ويستبعد المباني تماماً
        const query = `
        [out:json][timeout:20];
        (
          // البحث عن أراضي فضاء أو رملية أو عشبية فقط
          node["natural"~"sand|bare_rock"](around:15000,${lat},${lon});
          way["landuse"~"grass|meadow|brownfield"](around:15000,${lat},${lon});
          way["natural"~"sand|scrub"](around:15000,${lat},${lon});
        );
        // استبعاد أي نتائج تتداخل مع وسم مبنى
        nwr._["building"!~".*"]["landuse"!="residential"];
        out center;`;
        
        const res = await axios.post("https://overpass-api.de/api/interpreter", query, { timeout: 15000 });
        return res.data.elements || [];
    } catch (e) { return []; }
}

bot.on("location", async (msg) => {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    await bot.sendMessage(chatId, "🛡️ جاري البحث عن مهابط آمنة (يتم الآن استبعاد المناطق السكنية والمباني)...");

    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev || "5m",
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeSpot({}, s.type)
    }));

    const osmData = await fetchSafeZones(latitude, longitude);
    const osmResults = osmData.map(e => ({
        name: "منطقة مفتوحة مكتشفة", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon, elev: "AMSL",
        dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
        ...analyzeSpot(e.tags)
    }));

    // التصفية النهائية: نحذف أي شيء تم تصنيفه كمبنى أو محظور
    const final = [...myResults, ...osmResults]
        .filter(p => p.level !== "🚫 محظور")
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    if (final.length === 0) {
        return bot.sendMessage(chatId, "⚠️ لم يتم العثور على مناطق هبوط آمنة كافية بعيداً عن العمران.");
    }

    let report = "🚁 **المواقع الآمنة المقترحة (بعيداً عن المباني):**\n\n";
    const buttons = [];

    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ الحالة: ${p.level}\n📝 ملاحظة: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🗺️ فحص الموقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.get("/", (req, res) => res.send("Heli-Safe System Online"));
app.listen(process.env.PORT || 3000);
