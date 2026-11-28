// Runs before every test file, before any app code is loaded.
//
// src/config/env.js loads backend/.env with dotenv, and that file points at the PRODUCTION
// database. dotenv never overwrites a variable that is already set, so every value the app reads
// is set here first, unconditionally (this also wins over anything exported in the shell).
// test/helpers/db.js is the second guard: it refuses to touch any database that isn't localhost.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:1/ebr_test_placeholder'; // integration tests use the in-memory server's URI
process.env.MONGO_DB_NAME = 'ebr_test';
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
// Same time zone as production (Dockerfile): "today" and report dates depend on it.
process.env.TZ = 'Asia/Manila';
