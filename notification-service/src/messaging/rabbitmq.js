const amqp = require('amqplib');
const logger = require('../utils/logger');
const notificationService = require('../services/notification.service');
let channel;

async function initRabbitMQ() {
  for (let i = 0; i < 10; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      channel = await conn.createChannel();
      await channel.assertExchange('shopnest_events', 'topic', { durable: true });
      const q = await channel.assertQueue('notification_events', { durable: true });
      const events = ['user.registered','order.placed','order.shipped','order.delivered','order.cancelled','payment.completed','payment.failed','payment.refunded'];
      for (const e of events) await channel.bindQueue(q.queue, 'shopnest_events', e);
      channel.consume(q.queue, async (msg) => {
        if (!msg) return;
        try {
          await notificationService.handleEvent(msg.fields.routingKey, JSON.parse(msg.content.toString()));
          channel.ack(msg);
        } catch (err) {
          logger.error('Notification event error', err.message);
          channel.nack(msg, false, false);
        }
      });
      logger.info('RabbitMQ connected (notification-service)');
      return;
    } catch (err) {
      logger.warn(`RabbitMQ attempt ${i+1} failed. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to RabbitMQ');
}
module.exports = { initRabbitMQ };
