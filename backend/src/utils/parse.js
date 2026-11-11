const mongoose = require('mongoose');
const HttpError = require('./httpError');

// "YYYY-MM-DD" → Date at UTC midnight. Throws a 400 for anything else.
function parseDay(value, label = 'Date') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  const date = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!date || date.getUTCDate() !== +match[3]) throw new HttpError(400, `${label} is not a valid date`);
  return date;
}

// Today as a calendar day, in the server's local time zone.
function today() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function parseWholeNumber(value, label, { min = 0 } = {}) {
  const number = value === '' || value == null ? NaN : Number(value);
  if (!Number.isInteger(number) || number < min) {
    throw new HttpError(400, `${label} must be a whole number${min > 0 ? ` of at least ${min}` : ' (0 or more)'}`);
  }
  return number;
}

function parseObjectId(value, label = 'ID') {
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `${label} is not valid`);
  return value;
}

// Literal, case-insensitive "contains" match for user-typed search text.
function containsRegex(text) {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// The separate words of user-typed search text.
function searchWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

// A row matches when every word appears in at least one of `fields`, in any order.
// null when there are no words.
function allWordsFilter(text, fields) {
  const words = searchWords(text);
  if (!words.length) return null;
  return { $and: words.map((word) => ({ $or: fields.map((field) => ({ [field]: containsRegex(word) })) })) };
}

function parsePage(query, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { parseDay, today, parseWholeNumber, parseObjectId, containsRegex, searchWords, allWordsFilter, parsePage };
