import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const bot = new TelegramBot("8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE", { polling: true });

let localSpots = [];
try { localSpots = JSON.parse(fs.readFileSync("./locations.json", "utf-8")); } catch (e) {}

function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function analyzeGround(tags = {}, manualType = "") {
    // استبعاد البحار والمباني والطرق
    if (tags.natural === "water" || tags.bay || tags.coastline) return { valid: false };
    const forbidden = ['highway', 'building', 'residential', 'apartments', 'street'];
    for (let key of forbidden) { if (tags[key] || tags.landuse === 'residential') return { valid: false }; }

    const surface = tags.surface || "";
    const natural = tags.natural || manualType || "";
    
    if (natural.includes("rock") || surface.includes("rock") || surface.includes("stones") || natural === "rough") {
        return { level: "🔴 جبلية/صخرية", note: "أرض وعرة بها عوائق صلبة وصخور", risk: "عالي", valid: true };
    }
    if (natural.includes("sand") || surface.includes("sand")) {
        return { level: "🟡 صحراوية/رملية", note: "تربة رملية ناعمة (تأكد من الثبات)", risk: "متوسط", valid: true };
    }
    return { level: "🟢 مستوية/فضاء", note: "أرض مفتوحة ومنبسطة خالية من المنشآت", risk: "منخفض", valid: true };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    await bot.sendMessage(msg.chat.id, "🛰️ جاري مسح المنطقة واستبعاد العوائق والطرق...");

    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon,
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeGround({}, s.type)
    }));

    let osmResults = [];
    try {
        const query = `[out:json][timeout:15];(way(around:8000,${latitude},${longitude})["landuse"~"brownfield|grass"]["highway"!~".*"]["building"!~".*"];node(around:8000,${latitude},${longitude})["natural"~"sand|bare_rock|scrub"];);out center;`;
        const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        osmResults = (res.data.elements || []).map(e => ({
            name: "منطقة مرصودة آلياً", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon,
            dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
            ...analyzeGround(e.tags)
        }));
    } catch (e) {}

    const final = [...myResults, ...osmResults]
        .filter(p => p.valid === true)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    if (final.length === 0) return bot.sendMessage(msg.chat.id, "❌ لا توجد مناطق آمنة تماماً في هذا النطاق.");

    let report = "🚁 **أقرب 5 مهابط طوارئ آمنة:**\n\n";
    const buttons = [];
    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ النوع: ${p.level}\n📝 ${p.note}\n───────────────\n`;
        buttons.push([{ text: `📍 عرض موقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.listen(process.env.PORT || 3000);
