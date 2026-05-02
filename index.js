import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// توكن البوت
const TELEGRAM_TOKEN = '8657045334:AAH8m28orGYTz5VEfV4MyHcR1pLWiu5kGJE';

// إنشاء البوت
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// قراءة ملف المواقع
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

// استقبال الموقع
bot.on('location', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const { latitude, longitude } = msg.location;

    // تحليل المباني (هل المكان مزدحم أو فاضي)
    let buildings = 0;

    try {
      const url = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:100,${latitude},${longitude})["building"];out;`;
      const res = await fetch(url);
      const data = await res.json();
      buildings = data.elements.length;
    } catch (err) {
      console.log('OSM Error:', err.message);
    }

    // تقييم الأمان
    let safety = '';
    let notes = '';
    let risks = '';

    if (buildings === 0) {
      safety = '🟢 SAFE';
      notes = 'Open area, suitable for landing';
      risks = 'Possible wind or sand';
    } else if (buildings < 10) {
      safety = '🟡 MEDIUM';
      notes = 'Some obstacles nearby';
      risks = 'Buildings, cars, wires';
    } else {
      safety = '🔴 DANGEROUS';
      notes = 'Dense urban area';
      risks = 'High collision risk';
    }

    // أقرب مواقع (بدون مدن ثانية)
    const nearby = heliports
      .map(h => ({
        ...h,
        distance: getDistance(latitude, longitude, h.lat, h.lon)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    if (nearby.length === 0) {
      await bot.sendMessage(chatId, 'No nearby landing spots found');
      return;
    }

    // الرسالة
    let reply = `🚁 Landing Analysis\n\n`;
    reply += `Safety: ${safety}\n`;
    reply += `Notes: ${notes}\n`;
    reply += `Risks: ${risks}\n\n`;

    reply += `Nearest Landing Spots:\n`;
    nearby.forEach((h, i) => {
      reply += `${i + 1}- ${h.name} (${h.city}) — ${h.distance.toFixed(2)} km\n`;
    });

    // زر القمر الصناعي
    const keyboard = [
      [
        {
          text: '🛰️ View Satellite',
          url: `https://www.google.com/maps?q=${latitude},${longitude}&t=k`
        }
      ]
    ];

    await bot.sendMessage(chatId, reply, {
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (err) {
    console.log('ERROR:', err.message);
  }
});

// سيرفر Render
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
