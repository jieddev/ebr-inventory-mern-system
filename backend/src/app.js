const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { clientOrigin } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const itemRoutes = require('./routes/items.routes');
const transactionRoutes = require('./routes/transactions.routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/transactions', transactionRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
