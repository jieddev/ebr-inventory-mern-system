const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { port } = require('./src/config/env');
const { backfillItemIds } = require('./src/services/itemId.service');
const { syncAuditRetention } = require('./src/services/audit.service');

async function start() {
  try {
    await connectDB();
  } catch (err) {
    // Keep the API up so /api/health can report the DB problem.
    console.error('Could not connect to MongoDB:', err.message);
  }

  if (mongoose.connection.readyState === 1) {
    const backfilled = await backfillItemIds().catch((err) => console.error('Could not give items an ID:', err.message));
    if (backfilled) console.log(`Gave item IDs to ${backfilled} existing items`);

    const retention = await syncAuditRetention().catch((err) =>
      console.error('Could not update how long activity is kept:', err.message),
    );
    if (retention) {
      const days = (seconds) => Math.round(seconds / 86400);
      console.log(`Activity log now keeps entries ${days(retention.to)} days (was ${days(retention.from)})`);
    }
  }

  app.listen(port, () => console.log(`API running at http://localhost:${port}/api`));
}

start();
