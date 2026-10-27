const mongoose = require('mongoose');

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

function getHealth(req, res) {
  const db = DB_STATES[mongoose.connection.readyState] || 'unknown';
  res.status(db === 'connected' ? 200 : 503).json({
    status: db === 'connected' ? 'ok' : 'degraded',
    api: 'up',
    db,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

module.exports = { getHealth };
