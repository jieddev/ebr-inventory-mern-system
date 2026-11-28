const mongoose = require('mongoose');

// There is no staging database: anything that isn't this machine is production. Connecting to or
// clearing a database is refused unless every host in the URI is local.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

function hostsOf(uri) {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(String(uri ?? ''));
  if (!match) return [];
  return match[1].split(',').map((host) => host.replace(/:\d+$/, '').toLowerCase());
}

function assertLocalUri(uri) {
  const hosts = hostsOf(uri);
  if (!String(uri).startsWith('mongodb://') || !hosts.length || !hosts.every((h) => LOCAL_HOSTS.includes(h))) {
    throw new Error(`Refusing to use a non-local database in tests: ${hosts.join(', ') || 'unknown host'}`);
  }
}

function assertConnectedLocally() {
  const conn = mongoose.connection;
  if (conn.readyState !== 1) throw new Error('Not connected to the test database');
  assertLocalUri(`mongodb://${conn.host}:${conn.port}`);
}

// Connects to the in-memory server and builds every model's indexes first, so unique-key rules
// apply from the first test and no collection is created inside a transaction.
async function connect(uri) {
  assertLocalUri(uri);
  await mongoose.connect(uri, { dbName: 'ebr_test' });
  // Every model the app defines (app.js loads them all through the routes).
  require('../../src/app');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

// Empties every collection. Uses the driver directly: the AuditLog model refuses deletes.
async function clearDb() {
  assertConnectedLocally();
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { assertLocalUri, connect, clearDb, disconnect };
