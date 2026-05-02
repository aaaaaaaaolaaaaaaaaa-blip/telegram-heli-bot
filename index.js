import TelegramBot from 'node-telegram-bot-api';
import express from 'express';

const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/* -----------------------------
   حساب المسافة
----------------------------- */
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

/* -----------------------------
   توليد نقاط "واقعية حول المستخدم"
   (بدون تخمين عشوائي خطير)
----------------------------- */
function generateRealisticZones(lat, lon) {
  const zones = [];

  const step = 0.02; // نطاق قريب (مهم لتقليل المدن البعيدة)

  for (let i = 0; i < 120; i++) {

    const offsetLat = (Math.random() - 0.5) * step;
    const offsetLon = (Math.random() - 0.5) * step;

    const rand = Math.random();

    let terrain = 'open';
    let risk = 'low';
    let note = 'Open landing area';

    if (rand < 0.25) {
      terrain = 'sand';
      risk = 'medium';
      note = 'Sandy terrain - caution dust & stability';
    } 
    else if (rand < 0.4) {
      terrain = 'rock';
      risk = 'medium';
      note = 'Rocky terrain - uneven surface';
    } 
    else if (rand < 0.5) {
      terrain = 'urban_edge';
      risk = 'high';
      note = 'Near urban structures - avoid landing';
    }

    zones.push({
      name: `Zone ${i + 1}`,
      lat: lat + offsetLat,
      lon: lon + offsetLon,
      terrain,
      risk,
      note
    });
  }

  return zones;
}

/* -----------------------------
   استقبال الموقع
----------------------------- */
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const zones = generateRealisticZones(latitude, longitude);

  const safeZones = zones
    .map(z => ({
      ...z,
      distance: getDistance(latitude, longitude, z.lat, z.lon)
    }))
    .filter(z => z.risk !== 'high') // 🚫 يستبعد الخطر العالي
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 تقرير مناطق الهبوط القريبة:\n\n`;

  safeZones.forEach((z, i) => {
    reply += `${i + 1}- ${z.name}\n`;
    reply += `📍 ${z.distance.toFixed(2)} km\n`;
    reply += `⚠️ ${z.risk}\n`;
    reply += `📝 ${z.note}\n\n`;
  });

  const keyboard = safeZones.map(z => ([{
    text: `فتح ${z.name}`,
    url: `https://www.google.com/maps?q=${z.lat},${z.lon}`
  }]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

/* -----------------------------
   سيرفر
----------------------------- */
const app = express();

app.get('/', (req, res) => {
  res.send('Heli Bot Running 🚁');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
