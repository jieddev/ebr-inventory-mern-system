const { nodeEnv } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express 5 forwards rejected promises from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Mongoose validation and unique-index errors are the client's fault, not the server's.
  if (err.name === 'ValidationError') {
    err.status = 400;
    err.message = Object.values(err.errors)[0]?.message || err.message;
  } else if (err.code === 11000) {
    err.status = 409;
    err.message = 'This record already exists';
  }

  const status = err.status || err.statusCode || 500;
  // The request log line (pino-http in app.js) picks this up, with the stack and request ID.
  if (status >= 500) res.err = err;
  res.status(status).json({
    message: status >= 500 && nodeEnv === 'production' ? 'Internal server error' : err.message,
    ...(status >= 500 && nodeEnv !== 'production' && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
