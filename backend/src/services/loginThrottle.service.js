const LoginAttempt = require('../models/LoginAttempt');

// Wrong passwords allowed before having to wait: per username, and per computer (IP address),
// which also stops one computer from trying many usernames.
const MAX_FAILURES = { user: 3, ip: 10 };
// The first wait; each lockout after that doubles it, up to MAX_LOCK_MS.
const FIRST_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;

const keysFor = (userId, ip) => [
  { key: `user:${userId}`, max: MAX_FAILURES.user },
  { key: `ip:${ip}`, max: MAX_FAILURES.ip },
];

// Milliseconds until this username and computer may try again (0: they may try now).
async function lockRemaining(userId, ip) {
  const keys = keysFor(userId, ip).map((k) => k.key);
  const now = Date.now();
  const locked = await LoginAttempt.find({ _id: { $in: keys }, lockedUntil: { $gt: new Date(now) } }).lean();
  return Math.max(0, ...locked.map((l) => l.lockedUntil.getTime() - now));
}

// Counts a failed login. Reaching the limit starts a wait and the count starts over.
// Returns { lockedMs } (0 when not locked) and attemptsLeft before the next wait.
async function recordFailure(userId, ip) {
  let lockedMs = 0;
  let attemptsLeft = Infinity;
  for (const { key, max } of keysFor(userId, ip)) {
    const counter = await LoginAttempt.findOneAndUpdate(
      { _id: key },
      { $inc: { failures: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after', lean: true },
    );
    if (counter.failures < max) {
      attemptsLeft = Math.min(attemptsLeft, max - counter.failures);
      continue;
    }
    const lockMs = Math.min(FIRST_LOCK_MS * 2 ** counter.lockouts, MAX_LOCK_MS);
    await LoginAttempt.updateOne(
      { _id: key },
      { $set: { failures: 0, lockedUntil: new Date(Date.now() + lockMs) }, $inc: { lockouts: 1 } },
    );
    lockedMs = Math.max(lockedMs, lockMs);
  }
  return { lockedMs, attemptsLeft: lockedMs ? 0 : attemptsLeft };
}

// A successful login starts both counts over.
async function clearFailures(userId, ip) {
  await LoginAttempt.deleteMany({ _id: { $in: keysFor(userId, ip).map((k) => k.key) } });
}

module.exports = { lockRemaining, recordFailure, clearFailures };
