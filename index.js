import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import fs from 'fs';
import path from 'path';

// توكن البوت
const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';

// رابط موقعك (ضع رابط Render أو Railway)
const WEBHOOK_URL = 'https://telegram-heli-bot.onrender.com';

// إنشاء البوت بدون polling
const bot = new TelegramBot(TELEGRAM_TOKEN);

// قراءة بيانات المواقع من الملف
const dataPath = path.join(process.cwd(), 'saudi_heliports.json');
const heliports = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// دالة حساب المسافة
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ويب سيرفر
const app = express();
app.use(express.json());

// استقبال webhook من Telegram
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// استقبال الموقع
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  let closestCity = null;
  let minDistance = Infinity;

  heliports.forEach(h => {
    const dist = getDistance(latitude, longitude, h.lat, h.lon);
    if (dist < minDistance) {
      minDistance = dist;
      closestCity = h.city;
    }
  });

  const cityHeliports = heliports
    .filter(h => h.city === closestCity)
    .map(h => ({ ...h, distance: getDistance(latitude, longitude, h.lat, h.lon) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  if(cityHeliports.length === 0) {
    await bot.sendMessage(chatId, `لم يتم العثور على أماكن هبوط في ${closestCity}`);
    return;
  }

  let reply = `أقرب مواقع الهبوط في ${closestCity}:\n`;
  cityHeliports.forEach((h, i) => {
    reply += `${i + 1}- ${h.name} — المسافة: ${h.distance.toFixed(2)} كم\n`;
  });

  const inlineKeyboard = cityHeliports.map(h => ([{
    text: `افتح ${h.name}`,
    url: `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lon}&zoom=16`
  }]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
});

// الصفحة الرئيسية
app.get('/', (req,res) => res.send('Bot is running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('Server running on port ' + PORT);

  // تفعيل webhook
  await bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`);
});
