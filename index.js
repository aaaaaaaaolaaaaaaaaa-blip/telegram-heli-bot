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
    // استبعاد مطلق للمباني، الطرق، والبحار
    if (tags.natural === "water" || tags.coastline) return { valid: false };
    const forbidden = ['highway', 'building', 'residential', 'apartments', 'street'];
    for (let key of forbidden) { if (tags[key] || tags.landuse === 'residential') return { valid: false }; }

    const type = manualType || tags.natural || tags.landuse || "";
    
    // تصنيف الجبال (حتى لو كانت خالية فهي خطر)
    if (type.includes("rough") || type.includes("rock") || type.includes("peak") || type.includes("cliff")) {
        return { level: "🔴 خطر جداً (جبلي)", note: "أرض وعرة جداً، صخور حادة ومنحدرات. لا تصلح للهبوط.", risk: "حرج", valid: true };
    }
    
    // تصنيف الرمال
    if (type.includes("sand") || type === "desert") {
        return { level: "🟡 متوسط الخطورة (رملي)", note: "منطقة صحراوية، رمال قد تكون غير مستقرة.", risk: "متوسط", valid: true };
    }

    // تصنيف الأرض المستوية الفضاء
    if (type === "open" || type === "brownfield" || type === "grass") {
        return { level: "🟢 آمن (مستوٍ)", note: "أرض فضاء منبسطة خالية من العوائق والتضاريس الصعبة.", risk: "منخفض", valid: true };
    }

    return { level: "⚪ غير محدد", note: "منطقة تحتاج معاينة بصرية دقيقة.", risk: "مجهول", valid: true };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    await bot.sendMessage(msg.chat.id, "🔍 جاري تحليل تضاريس الأرض واستبعاد العوائق...");

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

    let report = "🚁 **نتائج تحليل مهابط الطوارئ:**\n\n";
    const buttons = [];
    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ التصنيف: ${p.level}\n📝 ${p.note}\n───────────────\n`;
        buttons.push([{ text: `📍 تفقد الموقع ${i+1} على الخريطة`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}` }]);
    });

    bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.listen(process.env.PORT || 3000);
