const mongoose = require('mongoose');
const { mongoUri, mongoDbName } = require('./env');
const logger = require('./logger');

async function connectDB() {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));

  // dbName wins over any database name in the URI.
  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 5000 });
}

module.exports = connectDB;
