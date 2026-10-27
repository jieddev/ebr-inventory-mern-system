const { nodeEnv } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express 5 forwards rejected promises from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    message: status >= 500 && nodeEnv === 'production' ? 'Internal server error' : err.message,
    ...(status >= 500 && nodeEnv !== 'production' && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
