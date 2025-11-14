// emailService.js
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const express = require('express');
require('dotenv').config();

const QUEUE = 'email.queue';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function start() {
  const conn = await amqp.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE, { durable: true });
  console.log('Email Service waiting for messages...');

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const data = JSON.parse(msg.content.toString());
    console.log('Email received', data);

    const templates = {
      welcome: (vars) => `<h1>Welcome ${vars.name}</h1><p>Visit: ${vars.link}</p>`,
      default: (vars) => `<p>${vars.body || 'Hello'}</p>`
    };
    const body = (templates[data.template_code] || templates.default)(data.variables || {});

    try {
      await transporter.sendMail({ from: process.env.EMAIL_USER, to: data.user_email, subject: data.variables.subject || 'Notification', html: body });
      console.log(`Email sent to ${data.user_email}`);
      channel.ack(msg);
    } catch (err) {
      console.error('Failed to send email', err);
      channel.nack(msg, false, false);
    }
  });
}

start().catch(err => console.error('Email service error', err));

// health endpoint
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
const PORT = process.env.EMAIL_SERVICE_PORT || 3001;
app.listen(PORT, () => console.log(`Email health running on port ${PORT}`));
