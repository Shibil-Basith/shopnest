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
      logger.info('RabbitMQ connected (product-service)');
      return;
    } catch (err) {
      attempt++;
      logger.warn(`RabbitMQ attempt ${attempt} failed. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to RabbitMQ');
}
async function publishEvent(routingKey, payload) {
  if (!channel) return;
  channel.publish('shopnest_events', routingKey, Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })), { persistent: true });
}
module.exports = { initRabbitMQ, publishEvent };
