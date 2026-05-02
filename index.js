
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import fs from 'fs';
import path from 'path';

const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* -------------------------
   قراءة البيانات
------------------------- */
const zones = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'saudi_zones.json'))
);

/* -------------------------
   حساب المسافة
------------------------- */
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

/* -------------------------
   تقييم عربي واقعي
------------------------- */
function analyzeTerrain(t) {
  if (t === 'open') return '🟢 مناسب للهبوط (أرض مفتوحة)';
  if (t === 'sand') return '🟡 رملية - تحتاج حذر عند الهبوط';
  if (t === 'rock') return '🟠 أرض صخرية - هبوط صعب';
  return '⚠️ غير معروف';
}

/* -------------------------
   استقبال الموقع
------------------------- */
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const results = zones
    .map(z => ({
      ...z,
      distance: getDistance(latitude, longitude, z.lat, z.lon)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 أقرب مناطق الهبوط القريبة منك:\n\n`;

  results.forEach((z, i) => {
    reply += `${i + 1}- ${z.name}\n`;
    reply += `📍 المسافة: ${z.distance.toFixed(2)} كم\n`;
    reply += `🧭 الحالة: ${analyzeTerrain(z.terrain)}\n\n`;
  });

  const keyboard = results.map(z => ([{
    text: `فتح ${z.name}`,
    url: `https://www.google.com/maps?q=${z.lat},${z.lon}`
  }]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

/* -------------------------
   سيرفر Render
------------------------- */
const app = express();

app.get('/', (req, res) => {
  res.send('🚁 البوت يعمل');
});

app.listen(process.env.PORT || 3000);
