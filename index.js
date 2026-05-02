import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import fs from 'fs';
import path from 'path';

// 🔑 التوكن
const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';

// بوت
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// بيانات المواقع
const dataPath = path.join(process.cwd(), 'saudi_heliports.json');
const heliports = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// 📏 حساب المسافة
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

// 🧠 تقييم الأرض
function analyzeTerrain(site) {
  if (site.terrain === 'open_land') {
    return '🟢 مناسب للهبوط (أرض مفتوحة)';
  }
  if (site.terrain === 'rocky') {
    return '🟡 أرض صخرية - تحتاج تقييم ميداني';
  }
  if (site.terrain === 'sand') {
    return '🔴 رمال - غير مستقرة';
  }
  return '⚠️ غير معروف';
}

// 📍 استقبال الموقع
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const results = heliports
    .map(h => ({
      ...h,
      distance: getDistance(latitude, longitude, h.lat, h.lon)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if (results.length === 0) {
    return bot.sendMessage(chatId, 'ما فيه مناطق قريبة.');
  }

  let reply = `📍 أقرب مناطق مناسبة للهبوط:\n\n`;

  results.forEach((h, i) => {
    reply += `${i + 1}- ${h.name}
📏 ${h.distance.toFixed(2)} كم
${analyzeTerrain(h)}\n\n`;
  });

  const buttons = results.map(h => ([{
    text: `فتح ${h.name}`,
    url: `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}&zoom=15`
  }]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: buttons }
  });
});

// 🌐 سيرفر Render
const app = express();
app.get('/', (req, res) => res.send('Bot Running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
