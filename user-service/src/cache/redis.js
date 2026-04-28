const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis;

async function initRedis() {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    retryStrategy: times => Math.min(times * 100, 3000),
  });
  redis.on('connect', () => logger.info('Redis connected (user-service)'));
  redis.on('error', err => logger.error('Redis error', err));
}

function getRedis() {
  return redis;
}

module.exports = { initRedis, getRedis };
