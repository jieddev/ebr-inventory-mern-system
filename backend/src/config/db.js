const mongoose = require('mongoose');
const { mongoUri, mongoDbName } = require('./env');

async function connectDB() {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  // dbName wins over any database name in the URI.
  await mongoose.connect(mongoUri, { dbName: mongoDbName, serverSelectionTimeoutMS: 5000 });
}

module.exports = connectDB;
