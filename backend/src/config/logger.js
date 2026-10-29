const pino = require('pino');
const { nodeEnv, logLevel } = require('./env');

// The app's logger. Development prints readable coloured lines (pino-pretty); production
// prints one JSON object per line. Business history ("who did what") is the AuditLog
// collection, not this.
const logger = pino({
  level: logLevel,
  // Session cookies, auth headers and passwords never reach the logs.
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password'],
    censor: '[hidden]',
  },
  ...(nodeEnv !== 'production' && {
    // The request fields are already in the message ("GET /api/items 200 12ms"), so they're hidden here.
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,req,res,responseTime' },
    },
  }),
});

module.exports = logger;
