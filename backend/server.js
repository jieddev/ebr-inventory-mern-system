const mongoose = require('mongoose');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { port } = require('./src/config/env');
const logger = require('./src/config/logger');
const { backfillItemIds } = require('./src/services/itemId.service');
const { syncAuditRetention } = require('./src/services/audit.service');

async function start() {
  try {
    await connectDB();
  } catch (err) {
    // Keep the API up so /api/health can report the DB problem.
    logger.error({ err }, 'Could not connect to MongoDB');
  }

  if (mongoose.connection.readyState === 1) {
    const backfilled = await backfillItemIds().catch((err) => logger.error({ err }, 'Could not give items an ID'));
    if (backfilled) logger.info(`Gave item IDs to ${backfilled} existing items`);

    const retention = await syncAuditRetention().catch((err) =>
      logger.error({ err }, 'Could not update how long activity is kept'),
    );
    if (retention) {
      const days = (seconds) => Math.round(seconds / 86400);
      logger.info(`Activity log now keeps entries ${days(retention.to)} days (was ${days(retention.from)})`);
    }
  }

  app.listen(port, () => logger.info(`API running at http://localhost:${port}/api`));
}

start();
