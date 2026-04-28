const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { initRabbitMQ } = require('./messaging/rabbitmq');
const logger = require('./utils/logger');
const notificationRoutes = require('./routes/notification.routes');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(helmet()); app.use(cors()); app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() }));
app.use('/api/v1/notifications', notificationRoutes);
app.use((err, req, res, next) => { logger.error(err.message); res.status(500).json({ error: 'Internal server error' }); });

async function bootstrap() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/notificationdb');
    logger.info('MongoDB connected (notification-service)');
    await initRabbitMQ();
    app.listen(PORT, () => logger.info(`Notification Service running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start', err.message);
    process.exit(1);
  }
}
bootstrap();
