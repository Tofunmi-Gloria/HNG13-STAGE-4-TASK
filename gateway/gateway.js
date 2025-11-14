// gateway.js
const express = require('express');
const bodyParser = require('body-parser');
const amqp = require('amqplib');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EMAIL_QUEUE = 'email.queue';
const PUSH_QUEUE = 'push.queue';
let channel;

async function start() {
  const conn = await amqp.connect(RABBITMQ_URL);
  channel = await conn.createChannel();
  await channel.assertQueue(EMAIL_QUEUE, { durable: true });
  await channel.assertQueue(PUSH_QUEUE, { durable: true });
  console.log('Gateway connected to RabbitMQ');
}
start().catch(err => console.error('RabbitMQ connect error', err));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

async function fetchUser(user_id) {
  try {
    const port = process.env.USER_SERVICE_PORT || 3004;
    const resp = await axios.get(`http://user_service:${port}/users/${user_id}`);
    return resp.data.data;
  } catch (err) {
    console.error('fetchUser error', err.message);
    return null;
  }
}

app.post('/api/v1/notifications', async (req, res) => {
  const payload = req.body;
  const { notification_type, user_id, template_code, variables, request_id } = payload;
  if (!notification_type || !user_id || !template_code) {
    return res.status(400).json({ success: false, message: 'missing required fields' });
  }

  const user = await fetchUser(user_id);
  if (!user) return res.status(404).json({ success: false, message: 'user not found' });

  const msg = {
    request_id: request_id || uuidv4(),
    notification_type,
    user_id,
    template_code,
    variables: variables || {},
    metadata: payload.metadata || {}
  };

  try {
    if (notification_type === 'email' && user.preferences && user.preferences.email) {
      channel.sendToQueue(EMAIL_QUEUE, Buffer.from(JSON.stringify({...msg, user_email: user.email})), { persistent: true });
    }
    if (notification_type === 'push' && user.preferences && user.preferences.push) {
      channel.sendToQueue(PUSH_QUEUE, Buffer.from(JSON.stringify({...msg, push_token: user.push_token})), { persistent: true });
    }
    return res.json({ success: true, message: 'notification queued', data: msg });
  } catch (err) {
    console.error('Failed to queue message', err);
    return res.status(500).json({ success: false, message: 'failed to queue message' });
  }
});

const PORT = process.env.GATEWAY_PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
