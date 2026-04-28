const winston = require('winston');
module.exports = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'notification-service' },
  transports: [new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })],
});
