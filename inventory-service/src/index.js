const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { initDB } = require('./db/database');
const { initRabbitMQ, subscribeToEvents } = require('./messaging/rabbitmq');
const logger = require('./utils/logger');
const inventoryRoutes = require('./routes/inventory.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(helmet()); app.use(cors()); app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'inventory-service', timestamp: new Date().toISOString(), uptime: process.uptime() }));
app.use('/api/v1/inventory', inventoryRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

async function bootstrap() {
  try {
    await initDB();
    await initRabbitMQ();
    await subscribeToEvents();
    app.listen(PORT, () => logger.info(`Inventory Service running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start Inventory Service', err);
    process.exit(1);
  }
}
bootstrap();
module.exports = app;
