const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { initDB } = require('./db/database');
const { initRabbitMQ } = require('./messaging/rabbitmq');
const { initRedis } = require('./cache/redis');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);

// ── 404 Handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap ────────────────────────────────────────────────
async function bootstrap() {
  try {
    await initDB();
    await initRedis();
    await initRabbitMQ();
    app.listen(PORT, () => {
      logger.info(`User Service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start User Service', err);
    process.exit(1);
  }
}

bootstrap();

module.exports = app;
