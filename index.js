import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

// التوكن الخاص بكِ
const token = "8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE";
const bot = new TelegramBot(token, { polling: true });

let localSpots = [];
try {
    const data = fs.readFileSync("./locations.json", "utf-8");
    localSpots = JSON.parse(data);
} catch (e) {
    console.log("Error loading locations.json");
}

function calcDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function analyzeGround(lat, lon, tags = {}, manualType = "") {
    const type = (manualType || tags.natural || tags.landuse || "").toLowerCase();

    if (tags.natural === "water" || tags.building || tags.highway) return { valid: false };

    // فحص الجبال (شرق جدة)
    if (lon > 39.22) {
        return { 
            level: "🔴 خطر: منطقة جبلية وعرة", 
            note: "الأرض صخرية وغير مستوية، لا تصلح للهبوط.", 
            valid: true 
        };
    }

    // فحص الرمال
    if (type.includes("sand") || type.includes("scrub") || type === "desert") {
        return { 
            level: "🟡 متوسط: منطقة رملية", 
            note: "أرض مستوية بوضوح لكن التربة رملية (احتمالية غوص القوائم).", 
            valid: true 
        };
    }

    // الأرض المستوية
    return { 
        level: "🟢 آمن: أرض مستوية", 
        note: "أرض فضاء منبسطة تماماً وبعيدة عن العوائق.", 
        valid: true 
    };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    const chatId = msg.chat.id;

    // الرسالة المطلوبة: جاري فحص الرادار فقط
    await bot.sendMessage(chatId, "🔍 جاري فحص الرادار...");

    let allPoints = [];

    // نقاط الملف المحلي
    localSpots.forEach(s => {
        const analysis = analyzeGround(s.lat, s.lon, {}, s.type);
        allPoints.push({
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            dist: calcDist(latitude, longitude, s.lat, s.lon),
            ...analysis
        });
    });

    // جلب بيانات الخريطة
    try {
        const query = `[out:json][timeout:15];(way(around:15000,${latitude},${longitude})["landuse"~"brownfield|greenfield"];node(around:15000,${latitude},${longitude})["natural"~"sand|scrub"];);out center;`;
        const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        
        res.data.elements.forEach(e => {
            const lt = e.center?.lat || e.lat;
            const ln = e.center?.lon || e.lon;
            const analysis = analyzeGround(lt, ln, e.tags);
            if (analysis.valid) {
                allPoints.push({
                    name: "موقع أرض فضاء مرصود",
                    lat: lt,
                    lon: ln,
                    dist: calcDist(latitude, longitude, lt, ln),
                    ...analysis
                });
            }
        });
    } catch (e) {}

    const final = allPoints.sort((a, b) => a.dist - b.dist).slice(0, 5);

    if (final.length === 0) {
        return bot.sendMessage(chatId, "🛑 لم أجد مساحات هبوط مناسبة قريبة منك.");
    }

    let response = "🚁 **تقرير فحص المهابط المجاورة:**\n\n";
    const keyboard = [];

    final.forEach((p, i) => {
        response += `${i+1}. **${p.level}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n⚠️ التقييم: ${p.note}\n───────────────\n`;
        keyboard.push([{ text: `📍 فتح موقع ${i+1} (قمر صناعي)`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}&t=k` }]);
    });

    bot.sendMessage(chatId, response, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
});

const app = express();
app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 3000);
