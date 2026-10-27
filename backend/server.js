const app = require('./src/app');
const connectDB = require('./src/config/db');
const { port } = require('./src/config/env');

async function start() {
  try {
    await connectDB();
  } catch (err) {
    // Keep the API up so /api/health can report the DB problem.
    console.error('Could not connect to MongoDB:', err.message);
  }

  app.listen(port, () => console.log(`API running at http://localhost:${port}/api`));
}

start();
