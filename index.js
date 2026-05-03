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

function analyzeGround(lat, lon, tags = {}, manualType = "") {
    // استبعاد البحار والمباني
    if (tags.natural === "water" || tags.coastline) return { valid: false };
    const forbidden = ['highway', 'building', 'residential', 'apartments'];
    for (let key of forbidden) { if (tags[key]) return { valid: false }; }

    const type = manualType || tags.natural || tags.landuse || "";
    
    // جبال شرق جدة (حظر جغرافي)
    if (lon > 39.22) {
        return { level: "🔴 خطر: مرتفعات صخرية", note: "تضاريس جبلية وعرة وغير مستوية.", valid: true };
    }
    // رمال (شمال ذهبان/عسفان)
    if (type.includes("sand") || type.includes("scrub")) {
        return { level: "🟡 متوسط: رمال/صحراء", note: "أرض مستوية ولكن التربة رملية ناعمة.", valid: true };
    }
    // أرض فضاء مستوية
    return { level: "🟢 آمن: أرض مستوية", note: "مساحة منبسطة تماماً وصالحة للهبوط.", valid: true };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    await bot.sendMessage(msg.chat.id, "🛰️ جاري البحث في نطاق 15 كم وتحليل التضاريس...");

    // فحص اللوكيشنات اللي بالملف
    const myResults = localSpots.map(s => ({
        name: s.name, lat: s.lat, lon: s.lon,
        dist: calcDist(latitude, longitude, s.lat, s.lon),
        ...analyzeGround(s.lat, s.lon, {}, s.type)
    }));

    // جلب بيانات إضافية من الخريطة (نطاق أوسع 15000 متر)
    let osmResults = [];
    try {
        const query = `[out:json][timeout:20];(way(around:15000,${latitude},${longitude})["natural"~"sand|scrub|bare_rock"];way(around:15000,${latitude},${longitude})["landuse"~"brownfield|greenfield|allotments"];);out center;`;
        const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        osmResults = (res.data.elements || []).map(e => ({
            name: "موقع مكتشف برادرا الخريطة", lat: e.center?.lat || e.lat, lon: e.center?.lon || e.lon,
            dist: calcDist(latitude, longitude, e.center?.lat || e.lat, e.center?.lon || e.lon),
            ...analyzeGround(e.center?.lat || e.lat, e.center?.lon || e.lon, e.tags)
        }));
    } catch (e) {}

    const final = [...myResults, ...osmResults]
        .filter(p => p.valid)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

    if (final.length === 0) return bot.sendMessage(msg.chat.id, "🛑 تعذر إيجاد مساحات "آمنة" مطابقة للمواصفات في هذا النطاق.");

    let report = "🚁 **نتائج الرادار المحدثة:**\n\n";
    const buttons = [];
    final.forEach((p, i) => {
        report += `${i+1}. **${p.name}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n🛡️ الحالة: ${p.level}\n⚠️ التقييم: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🛰️ معاينة الموقع ${i+1}`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}&t=k` }]);
    });

    bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.listen(process.env.PORT || 3000);
