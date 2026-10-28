const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { RETENTION_SECONDS } = require('../models/AuditLog');

// "ITM-00012 · 2.25-17 TUBE · IZUMI TUBE · TUBE"
function describe({ code, brand, typeDesign }) {
  return [code, brand, typeDesign].filter(Boolean).join(' · ');
}

function itemTarget(item) {
  return {
    type: 'item',
    id: item._id,
    label: [item.itemId, describe(item)].filter(Boolean).join(' · '),
  };
}

function actorOf(user) {
  return user ? { user: user._id, userId: user.userId, name: user.name, role: user.role } : undefined;
}

// Writes one entry for the signed-in user (or `actor`, e.g. at login). Pass the request's
// MongoDB session so the entry is saved, or rolled back, together with the change.
async function record(req, { action, target, changes, details, actor = req.user }, session) {
  const [entry] = await AuditLog.create(
    [
      {
        action,
        actor: actorOf(actor),
        target,
        changes,
        details,
        ip: req.ip,
        userAgent: String(req.get('User-Agent') ?? '').slice(0, 300),
      },
    ],
    { session },
  );
  return entry;
}

// For logins and logouts: a logging problem is reported but never stops anyone signing in.
async function recordQuietly(req, entry) {
  try {
    await record(req, entry);
  } catch (err) {
    console.error('Could not write audit log entry:', entry.action, err.message);
  }
}

// { field: { from, to } } for the fields whose value differs, or null when nothing changed.
function diff(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    const from = before[field] ?? '';
    const to = after[field] ?? '';
    if (from !== to) changes[field] = { from, to };
  }
  return Object.keys(changes).length ? changes : null;
}

// MongoDB keeps an existing TTL index's expiry when the code asks for a new one, so a
// changed RETENTION_SECONDS is applied here at startup. Returns { from, to } when it changed.
async function syncAuditRetention() {
  const indexes = await AuditLog.collection.indexes().catch(() => []); // no collection yet
  const ttl = indexes.find((index) => index.expireAfterSeconds != null);
  if (!ttl || ttl.expireAfterSeconds === RETENTION_SECONDS) return null;

  await mongoose.connection.db.command({
    collMod: AuditLog.collection.collectionName,
    index: { name: ttl.name, expireAfterSeconds: RETENTION_SECONDS },
  });
  return { from: ttl.expireAfterSeconds, to: RETENTION_SECONDS };
}

module.exports = { record, recordQuietly, diff, describe, itemTarget, syncAuditRetention };
