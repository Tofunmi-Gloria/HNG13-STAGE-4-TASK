// pushService.js
const amqp = require('amqplib');
const admin = require('firebase-admin');
const express = require('express');
require('dotenv').config();

const QUEUE = 'push.queue';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

try {
  admin.initializeApp({ credential: admin.credential.cert(require(process.env.FCM_CREDENTIALS)) });
} catch (err) {
  console.warn('FCM init warning (are credentials set?)', err.message);
}

async function start() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE, { durable: true });
  console.log('Push Service waiting for messages...');

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    console.log('Push received', data);

    if (!data.push_token) {
      console.log('No push token; acking');
      channel.ack(msg);
      return;
    }

    const message = {
      token: data.push_token,
      notification: { title: data.variables.title || 'Notification', body: data.variables.body || data.variables.message || 'You have a notification' },
      data: data.metadata || {}
    };

    try {
      await admin.messaging().send(message);
      console.log(`Push sent to ${data.push_token}`);
      channel.ack(msg);
    } catch (err) {
      console.error('Failed to send push', err);
      channel.nack(msg, false, false);
    }
  });
}

start().catch(err => console.error('Push service error', err));

// health endpoint
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.PUSH_SERVICE_PORT || 3002;
app.listen(PORT, () => console.log(`Push health running on port ${PORT}`));
