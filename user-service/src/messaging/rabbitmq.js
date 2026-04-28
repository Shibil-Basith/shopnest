const amqp = require('amqplib');
const logger = require('../utils/logger');

let channel;

async function initRabbitMQ() {
  const maxRetries = 10;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      channel = await connection.createChannel();
      await channel.assertExchange('shopnest_events', 'topic', { durable: true });
      logger.info('RabbitMQ connected (user-service)');
      return;
    } catch (err) {
      attempt++;
      logger.warn(`RabbitMQ connection attempt ${attempt} failed. Retrying in 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to RabbitMQ after multiple attempts');
}

async function publishEvent(routingKey, payload) {
  if (!channel) return;
  const message = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });
  channel.publish('shopnest_events', routingKey, Buffer.from(message), { persistent: true });
  logger.info(`Event published: ${routingKey}`);
}

module.exports = { initRabbitMQ, publishEvent };
