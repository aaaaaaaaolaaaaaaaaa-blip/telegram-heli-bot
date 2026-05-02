import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import fs from 'fs';
import path from 'path';

// 🔴 توكن البوت (حطه هنا)
const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// قراءة ملف المواقع
const heliports = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'saudi_heliports.json'))
);

// حساب المسافة
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// تحليل بسيط للتضاريس
function analyzeTerrain(site) {
  if (site.type === 'airport') {
    return { status: 'safe', msg: '🟢 آمن - موقع مهيأ للهبوط' };
  }

  if (site.type === 'urban_rooftop') {
    return { status: 'danger', msg: '⚠️ خطر - منطقة مباني' };
  }

  if (site.type === 'coastal') {
    return { status: 'caution', msg: '⚠️ رياح محتملة - منطقة ساحلية' };
  }

  return { status: 'unknown', msg: '🟡 غير معروف - استخدم حذر' };
}

// أقرب مدينة
function getClosestCity(lat, lon) {
  let bestCity = null;
  let bestDist = Infinity;

  heliports.forEach(h => {
    const d = getDistance(lat, lon, h.lat, h.lon);
    if (d < bestDist) {
      bestDist = d;
      bestCity = h.city;
    }
  });

  return bestCity;
}

// استقبال الموقع
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const city = getClosestCity(latitude, longitude);

  const results = heliports
    .filter(h => h.city === city)
    .map(h => ({
      ...h,
      distance: getDistance(latitude, longitude, h.lat, h.lon),
      analysis: analyzeTerrain(h)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (!results.length) {
    return bot.sendMessage(chatId, 'ما تم العثور على مواقع قريبة.');
  }

  let reply = `📍 أقرب مواقع الهبوط في ${city}:\n\n`;

  results.forEach((r, i) => {
    reply += `${i + 1}- ${r.name}\n`;
    reply += `📏 ${r.distance.toFixed(2)} كم\n`;
    reply += `${r.analysis.msg}\n\n`;
  });

  const keyboard = results.map(r => ([{
    text: `فتح ${r.name}`,
    url: `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}&zoom=16`
  }]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

// سيرفر Render
const app = express();

app.get('/', (req, res) => {
  res.send('Heli Bot Running 🚁');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
