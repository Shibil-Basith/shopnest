const logger = require('../utils/logger');

exports.errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack });
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
