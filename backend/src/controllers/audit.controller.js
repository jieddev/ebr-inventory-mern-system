const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { parseDay, parseObjectId, containsRegex, parsePage } = require('../utils/parse');

const GROUPS = ['auth', 'item', 'transaction', 'user'];
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/audit?group=&user=&from=&to=&search=&page=&limit= — the admin Activity page.
// group: auth | item | transaction | user. from / to: YYYY-MM-DD, both days included.
// search: the target (e.g. an item ID or code) or the ID typed at a failed login.
async function listAuditLog(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 50, maxLimit: 100 });
  const filter = {};

  const group = String(req.query.group ?? '');
  if (group) {
    if (!GROUPS.includes(group)) throw new HttpError(400, `Group must be one of: ${GROUPS.join(', ')}`);
    filter.action = new RegExp(`^${group}\\.`);
  }
  if (req.query.user) filter['actor.user'] = new mongoose.Types.ObjectId(parseObjectId(req.query.user, 'User'));
  if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = parseDay(req.query.from, 'From date');
    // "To" is a calendar day, so include all of it.
    if (req.query.to) filter.at.$lt = new Date(parseDay(req.query.to, 'To date').getTime() + DAY_MS);
  }
  const search = String(req.query.search ?? '').trim();
  if (search) {
    const rx = containsRegex(search);
    filter.$or = [{ 'target.label': rx }, { 'details.userId': rx }, { 'actor.userId': rx }, { 'actor.name': rx }];
  }

  const [total, entries, users] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    User.find().sort({ name: 1 }).select('userId name').lean(),
  ]);
  res.json({ entries, users, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

module.exports = { listAuditLog };
