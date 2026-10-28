const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { ACTIONS } = require('../models/AuditLog');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { parseDay, parseObjectId, containsRegex, parsePage } = require('../utils/parse');

// The Activity filter's "Activity type" choices → the actions each one covers.
const TYPES = [
  { value: 'login', label: 'Logins and logouts', actions: ['auth.login', 'auth.logout'] },
  { value: 'failed_login', label: 'Failed logins', actions: ['auth.login_failed'] },
  { value: 'item', label: 'Items', actions: ACTIONS.filter((a) => a.startsWith('item.')) },
  { value: 'transaction', label: 'Transactions', actions: ['transaction.create'] },
  { value: 'user', label: 'Users', actions: ['user.create'] },
];
const DAY_MS = 24 * 60 * 60 * 1000;

const listParam = (value) => [...new Set([].concat(value ?? []).map(String).filter(Boolean))];

// GET /api/audit?type=&user=&from=&to=&search=&page=&limit= — the admin Activity page.
// type and user can repeat (?type=item&type=user). type: see TYPES. user: a User _id.
// from / to: YYYY-MM-DD, both days included. search: the target (e.g. an item ID or code),
// the user, or the ID typed at a failed login.
async function listAuditLog(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 50, maxLimit: 100 });
  const filter = {};

  const types = listParam(req.query.type);
  if (types.length) {
    const unknown = types.find((t) => !TYPES.some((type) => type.value === t));
    if (unknown) throw new HttpError(400, `Unknown activity type: ${unknown}`);
    filter.action = { $in: TYPES.filter((t) => types.includes(t.value)).flatMap((t) => t.actions) };
  }
  const users = listParam(req.query.user);
  if (users.length) {
    filter['actor.user'] = { $in: users.map((id) => new mongoose.Types.ObjectId(parseObjectId(id, 'User'))) };
  }
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

  const [total, entries, userList] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ at: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    // Names for the user filter chips.
    User.find().sort({ name: 1 }).select('userId name').lean(),
  ]);
  res.json({ entries, users: userList, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

// GET /api/audit/facets — choices and counts for the Activity filter dropdown.
async function listAuditFacets(req, res) {
  const [byAction, byUser] = await Promise.all([
    AuditLog.aggregate([{ $group: { _id: '$action', count: { $sum: 1 } } }]),
    AuditLog.aggregate([
      { $match: { 'actor.user': { $ne: null } } },
      // The name the user had most recently.
      { $sort: { at: 1 } },
      { $group: { _id: '$actor.user', count: { $sum: 1 }, name: { $last: '$actor.name' }, userId: { $last: '$actor.userId' } } },
      { $sort: { name: 1 } },
    ]),
  ]);
  const countByAction = new Map(byAction.map((a) => [a._id, a.count]));

  res.json({
    types: TYPES.map(({ value, label, actions }) => ({
      value,
      label,
      count: actions.reduce((sum, action) => sum + (countByAction.get(action) ?? 0), 0),
    })),
    users: byUser.map((u) => ({ value: String(u._id), label: `${u.name} (${u.userId})`, count: u.count })),
  });
}

module.exports = { listAuditLog, listAuditFacets };
