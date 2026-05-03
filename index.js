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
    // 1. حظر فوري لأي منطقة مائية (البحر)
    if (tags.natural === "water" || tags.bay || tags.coastline) return { valid: false };

    // 2. حظر المباني والطرق والاحياء
    const forbidden = ['highway', 'building', 'residential', 'apartments', 'street'];
    for (let key of forbidden) { if (tags[key] || tags.landuse === 'residential') return { valid: false }; }

    // 3. تحليل الحجارة والارتفاع من الأوسمة
    const surface = tags.surface || "";
    const natural = tags.natural || manualType || "";
    
    if (natural.includes("rock") || surface.includes("rock") || surface.includes("stones") || natural === "rough") {
        return { level: "🔴 جبلية/صخرية", note: "تحذير: الأرض وعرة وبها حجارة وعوائق صلبة", risk: "عالي", valid: true };
    }
    if (natural.includes("sand") || surface.includes("sand")) {
        return { level: "🟡 صحراوية/رملية", note: "أرض رملية ناعمة، يفضل فحص الثبات قبل الهبوط", risk: "متوسط", valid: true };
    }
    return { level: "🟢 مستوية/فضاء", note: "أرض مفتوحة ومنبسطة بعيدة عن المباني", risk: "منخفض", valid: true };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    await bot.sendMessage(msg.chat.id, "🛰️ جاري تحليل صور الأقمار الصناعية واستبعاد المباني والبحار...");

    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon, elev: s.elev,
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeGround({}, s.type)
    }));

    let osmResults = [];
    try {
        const query = `[out:json][timeout:15];(way(around:8000,${latitude},${longitude})["landuse"~"brownfield|grass"]["highway"!~".*"]["building"!~".*"];node(around:8000,${latitude},${longitude})["natural"~"sand|bare_rock|scrub"];);out center;`;
        const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        osmResults = (res.data.elements || []).map(e => ({
            name: "منطقة مرصودة آلياً", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon, elev: "متوسط الارتفاع",
            dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
            ...analyzeGround(e.tags)
        }));
    } catch (e) {}

    const final = [...myResults, ...osmResults]
        .filter(p => p.valid === true)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    if (final.length === 0) return bot.sendMessage(msg.chat.id, "❌ لم نجد مناطق آمنة تماماً، حاول الانتقال لمكان أبعد عن العمران.");

    let report = "🚁 **تقرير فحص المهبط النهائي:**\n\n";
    const buttons = [];
    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ النوع: ${p.level}\n⛰️ الارتفاع: ${p.elev}\n📝 ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🗺️ فحص الموقع ${i+1} على Google Maps`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.listen(process.env.PORT || 3000);
