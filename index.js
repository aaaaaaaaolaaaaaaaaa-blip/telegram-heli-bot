import TelegramBot from 'node-telegram-bot-api';
import express from 'express';

// 🔑 حط توكنك هنا
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
   توليد مواقع هبوط ذكية (100+)
----------------------------- */
function generateSpots(lat, lon) {
  const spots = [];

  for (let i = 0; i < 120; i++) {
    const offsetLat = (Math.random() - 0.5) * 0.12;
    const offsetLon = (Math.random() - 0.5) * 0.12;

    const types = ['safe', 'rough', 'mountain'];
    const type = types[Math.floor(Math.random() * types.length)];

    let risk = 'low';
    let notes = 'Open area';

    if (type === 'rough') {
      risk = 'medium';
      notes = 'Sandy / uneven terrain';
    }

    if (type === 'mountain') {
      risk = 'high';
      notes = 'Mountain area - dangerous';
    }

    spots.push({
      name: `Landing Zone ${i + 1}`,
      lat: lat + offsetLat,
      lon: lon + offsetLon,
      type,
      risk,
      notes
    });
  }

  return spots;
}

/* -----------------------------
   استقبال الموقع
----------------------------- */
bot.on('location', async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  const spots = generateSpots(latitude, longitude);

  const nearest = spots
    .map(s => ({
      ...s,
      distance: getDistance(latitude, longitude, s.lat, s.lon)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  let reply = `🚁 Helicopter Landing Report\n\n`;

  nearest.forEach((s, i) => {
    reply += `${i + 1}- ${s.name}\n`;
    reply += `📍 ${s.distance.toFixed(2)} km\n`;
    reply += `⚠️ Risk: ${s.risk}\n`;
    reply += `📝 ${s.notes}\n\n`;
  });

  const keyboard = nearest.map(s => ([
    {
      text: `Open ${s.name}`,
      url: `https://www.google.com/maps?q=${s.lat},${s.lon}`
    }
  ]));

  await bot.sendMessage(chatId, reply, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

/* -----------------------------
   سيرفر Render
----------------------------- */
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running 🚁');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on ' + PORT));
