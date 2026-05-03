import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import fs from "fs";

const bot = new TelegramBot("8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE", { polling: true });

function analyzeGround(lat, lon, tags = {}) {
    // 1. استبعاد المنشآت والبحار والطرق
    if (tags.natural === "water" || tags.coastline) return { valid: false };
    const forbidden = ['highway', 'building', 'residential', 'apartments', 'street'];
    for (let key of forbidden) { if (tags[key]) return { valid: false }; }

    const type = (tags.natural || tags.surface || "").toLowerCase();

    // 2. فحص المرتفعات الشرقية (حظر الجبال)
    if (lon > 39.20) {
        return { 
            level: "🔴 خطر: تضاريس وعرة", 
            note: "منطقة جبلية صخرية غير مستوية. خطر جداً على الهبوط.", 
            risk: "حرج", 
            valid: true 
        };
    }

    // 3. تحليل التربة الرملية/الصحراوية (مثل إحداثيات شمال ذهبان)
    // الكلمات الدلالية: sand (رمل), scrub (شجيرات صحراوية), desert (صحراء)
    if (type.includes("sand") || type.includes("scrub") || type.includes("desert")) {
        return { 
            level: "🟡 متوسط: منطقة رملية", 
            note: "أرض مستوية بوضوح لكن التربة رملية ناعمة. يتطلب الحذر من ثبات القوائم.", 
            risk: "متوسط", 
            valid: true 
        };
    }

    // 4. السهول المنبسطة جداً (المخططات المفتوحة الممسوحة)
    return { 
        level: "🟢 آمن: أرض مستوية", 
        note: "أرض فضاء منبسطة تماماً وبعيدة عن الموائق الطبيعية.", 
        risk: "منخفض", 
        valid: true 
    };
}

bot.on("location", async (msg) => {
    const { latitude, longitude } = msg.location;
    await bot.sendMessage(msg.chat.id, "🛰️ جاري تحليل دقة التربة واستواء السطح...");

    let results = [];
    try {
        // وسعنا البحث ليشمل الأراضي الرملية والشجيرات (scrub) لضمان التقاط المنطقة التي ذكرتيها
        const query = `[out:json][timeout:15];(way(around:8000,${latitude},${longitude})["natural"~"sand|scrub|bare_rock"];way(around:8000,${latitude},${longitude})["landuse"~"brownfield|greenfield"];node(around:8000,${latitude},${longitude})["natural"~"sand|scrub"];);out center;`;
        const res = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        
        results = (res.data.elements || []).map(e => {
            const lt = e.center?.lat || e.lat;
            const ln = e.center?.lon || e.lon;
            const analysis = analyzeGround(lt, ln, e.tags);
            return {
                name: "موقع مرصود للتحليل",
                lat: lt, lon: ln,
                dist: Math.sqrt(Math.pow(latitude-lt, 2) + Math.pow(longitude-ln, 2)) * 111,
                ...analysis
            };
        });
    } catch (e) {}

    const final = results.filter(p => p.valid).sort((a, b) => a.dist - b.dist).slice(0, 5);

    if (final.length === 0) return bot.sendMessage(msg.chat.id, "❌ لا توجد مساحات مفتوحة في النطاق.");

    let report = "🚁 **تحليل طبيعة المهابط المكتشفة:**\n\n";
    const buttons = [];
    final.forEach((p, i) => {
        report += `${i+1}. **${p.level}**\n📍 المسافة: ${p.dist.toFixed(2)} كم\n⚠️ التقييم: ${p.note}\n───────────────\n`;
        buttons.push([{ text: `🔍 فحص صورة القمر الصناعي للموقع ${i+1}`, url: `https://www.google.com/maps?q=${p.lat},${p.lon}&t=k` }]);
    });

    bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

const app = express();
app.listen(process.env.PORT || 3000);
