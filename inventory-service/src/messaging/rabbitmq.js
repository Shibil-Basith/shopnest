const amqp = require('amqplib');
const logger = require('../utils/logger');
const { getPool } = require('../db/database');

let channel;

async function initRabbitMQ() {
  const maxRetries = 10;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      channel = await conn.createChannel();
      await channel.assertExchange('shopnest_events', 'topic', { durable: true });
      logger.info('RabbitMQ connected (inventory-service)');
      return;
    } catch (err) {
      logger.warn(`RabbitMQ attempt ${i+1} failed. Retrying...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('Could not connect to RabbitMQ');
}

async function subscribeToEvents() {
  const queue = await channel.assertQueue('inventory_events', { durable: true });
  await channel.bindQueue(queue.queue, 'shopnest_events', 'product.created');
  await channel.bindQueue(queue.queue, 'shopnest_events', 'order.placed');
  await channel.bindQueue(queue.queue, 'shopnest_events', 'order.cancelled');

  channel.consume(queue.queue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      const key = msg.fields.routingKey;
      logger.info(`Inventory received event: ${key}`);

      const pool = getPool();
      if (key === 'product.created') {
        await pool.query(
          'INSERT INTO inventory (product_id, sku, quantity) VALUES ($1, $2, 0) ON CONFLICT (product_id) DO NOTHING',
          [event.productId, event.sku]
        );
      } else if (key === 'order.placed') {
        // Reserve stock for each item
        for (const item of (event.items || [])) {
          await pool.query(`
            UPDATE inventory SET reserved_quantity = reserved_quantity + $1, updated_at = NOW()
            WHERE product_id = $2 AND quantity - reserved_quantity >= $1
          `, [item.quantity, item.productId]);
        }
      } else if (key === 'order.cancelled') {
        // Release reserved stock
        for (const item of (event.items || [])) {
          await pool.query(`
            UPDATE inventory SET reserved_quantity = GREATEST(0, reserved_quantity - $1), updated_at = NOW()
            WHERE product_id = $2
          `, [item.quantity, item.productId]);
        }
      }
      channel.ack(msg);
    } catch (err) {
      logger.error('Error processing inventory event', err);
      channel.nack(msg, false, false);
    }
  });
}

async function publishEvent(routingKey, payload) {
  if (!channel) return;
  channel.publish('shopnest_events', routingKey, Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() })), { persistent: true });
}

module.exports = { initRabbitMQ, subscribeToEvents, publishEvent };
