const { can } = require('../config/permissions');

// Open Server-Sent Events connections, one per browser tab, with the signed-in user's ID,
// role, permissions and cost center (none for admins).
// Kept in memory, which is fine while there is a single API process.
const clients = new Map();

// Who may receive an event. Most events carry transaction details (quantities, customers),
// so by default only users who add transactions get them; item-only events go to EVERYONE.
const EVERYONE = null;

function addClient(res, { userId, role, permissions, costCenter }) {
  clients.set(res, { userId: String(userId), role, permissions, costCenter });
  return () => clients.delete(res);
}

// Ends a user's open connections, e.g. when their account is disabled, so they stop getting
// live updates at once. Their browser's reconnect is refused (401), and their next request
// signs them out. After a permission change the reconnect picks up the new permissions.
function disconnectUser(userId) {
  for (const [res, client] of clients) if (client.userId === String(userId)) res.end();
}

// Sends one event about `costCenter`'s data to every connected browser whose user has
// `permission` (and not `unless`) and works in that cost center. Admins have every permission,
// get every cost center's events, tagged with costCenter, and skip the ones for a cost center
// they aren't viewing (frontend useLiveUpdates.js).
function broadcast(event, data, { permission = 'addTransactions', unless, costCenter }) {
  const message = `event: ${event}\ndata: ${JSON.stringify({ ...data, costCenter })}\n\n`;
  for (const [res, client] of clients) {
    if (permission && !can(client, permission)) continue;
    if (unless && can(client, unless)) continue;
    if (client.role !== 'admin' && client.costCenter !== costCenter) continue;
    res.write(message);
  }
}

// The browser tab that made a request (see frontend api/client.js), so that tab can
// skip announcements about its own save.
function sourceClientId(req) {
  return String(req.get('X-Client-Id') ?? '').slice(0, 64);
}

module.exports = { addClient, broadcast, disconnectUser, sourceClientId, EVERYONE };
