const logger = require('../utils/logger');
exports.errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({ error: err.status === 500 || !err.status ? 'Internal server error' : err.message });
};
