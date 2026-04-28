const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { initDB } = require('./db/database');
const { initRabbitMQ } = require('./messaging/rabbitmq');
const { initRedis } = require('./cache/redis');
const logger = require('./utils/logger');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'product-service', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

async function bootstrap() {
  try {
    await initDB();
    await initRedis();
    await initRabbitMQ();
    app.listen(PORT, () => logger.info(`Product Service running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start Product Service', err);
    process.exit(1);
  }
}

bootstrap();
module.exports = app;
