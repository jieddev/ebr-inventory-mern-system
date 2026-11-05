const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const logger = require('./config/logger');
const { clientOrigin } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const itemRoutes = require('./routes/items.routes');
const transactionRoutes = require('./routes/transactions.routes');
const eventRoutes = require('./routes/events.routes');
const auditRoutes = require('./routes/audit.routes');
const receivingRoutes = require('./routes/receiving.routes');
const reportRoutes = require('./routes/reports.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// One log line per API request: method, URL, status, time taken and who made it.
// Skips the health check and the live-updates stream (one long request per open tab).
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url.startsWith('/api/health') || req.url.startsWith('/api/events') },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customProps: (req) => (req.user ? { user: req.user.userId } : {}),
    customSuccessMessage: (req, res, ms) => `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.originalUrl} ${res.statusCode} ${err.message}`,
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/receiving-reports', receivingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve the built frontend (npm run build in frontend/) so one port hosts the whole app.
// Any non-API path gets index.html and React Router takes it from there.
const clientDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
