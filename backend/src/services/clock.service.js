const mongoose = require('mongoose');
const logger = require('../config/logger');

// Every date the app saves comes from this computer's clock. This checks that clock against the
// database server's clock (MongoDB's `hello` reply carries its localTime), so a wrong clock is
// reported instead of silently putting wrong dates on new entries. It only warns, never blocks.
const MAX_DRIFT_MS = 2 * 60 * 1000;
const RECHECK_MS = 10 * 60 * 1000;

let last = { ok: null, driftMs: null, checkedAt: null };

async function checkClock() {
  try {
    const sentAt = Date.now();
    const { localTime } = await mongoose.connection.db.admin().command({ hello: 1 });
    const receivedAt = Date.now();
    // Assume the reply was stamped halfway through the round trip.
    const driftMs = Math.round((sentAt + receivedAt) / 2 - new Date(localTime).getTime());
    const ok = Math.abs(driftMs) <= MAX_DRIFT_MS;
    last = { ok, driftMs, checkedAt: new Date(receivedAt) };
    if (!ok) {
      logger.warn(
        `This computer's clock is off by ${Math.round(driftMs / 60000)} min compared with the database server. ` +
          'Fix the system clock, or new entries will get wrong dates.',
      );
    }
  } catch (err) {
    last = { ok: null, driftMs: null, checkedAt: new Date() };
    logger.debug({ err }, 'Could not check the clock against the database');
  }
  return last;
}

function startClockCheck() {
  checkClock();
  setInterval(checkClock, RECHECK_MS).unref();
}

function clockStatus() {
  return { ...last, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

module.exports = { startClockCheck, clockStatus };
