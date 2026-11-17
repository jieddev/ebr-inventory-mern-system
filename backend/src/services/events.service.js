const { can } = require('../config/permissions');

// Open Server-Sent Events connections, one per browser tab, with the signed-in user's ID,
// role, permissions and cost centers (every one for admins).
// Kept in memory, which is fine while there is a single API process.
const clients = new Map();

// Who may receive an event. Most events carry transaction details (quantities, customers),
// so by default only users who add transactions get them; item-only events go to EVERYONE.
const EVERYONE = null;
// Users who can open the Transactions page (frontend utils/permissions.js TRANSACTION_VIEW_PERMISSIONS).
const TRANSACTION_VIEWERS = ['addTransactions', 'viewTransactions'];

function addClient(res, { userId, role, permissions, costCenters }) {
  clients.set(res, { userId: String(userId), role, permissions, costCenters });
  return () => clients.delete(res);
}

// Ends a user's open connections, e.g. when their account is disabled, so they stop getting
// live updates at once. Their browser's reconnect is refused (401), and their next request
// signs them out. After a permission change the reconnect picks up the new permissions.
function disconnectUser(userId) {
  for (const [res, client] of clients) if (client.userId === String(userId)) res.end();
}

// Sends one event about `costCenter`'s data to every connected browser whose user has
// `permission` (and not `unless`; each one permission or a list of any) and may work in that cost
// center. Admins have every permission. By default, everyone who can open the Transactions page.
// Events are tagged with costCenter, and users with several cost centers skip the ones for a
// cost center they aren't viewing (frontend useLiveUpdates.js).
function broadcast(event, data, { permission = TRANSACTION_VIEWERS, unless, costCenter }) {
  const message = `event: ${event}\ndata: ${JSON.stringify({ ...data, costCenter })}\n\n`;
  const canAny = (client, permissions) => [].concat(permissions).some((p) => can(client, p));
  for (const [res, client] of clients) {
    if (permission && !canAny(client, permission)) continue;
    if (unless && canAny(client, unless)) continue;
    if (!client.costCenters.includes(costCenter)) continue;
    res.write(message);
  }
}

// The browser tab that made a request (see frontend api/client.js), so that tab can
// skip announcements about its own save.
function sourceClientId(req) {
  return String(req.get('X-Client-Id') ?? '').slice(0, 64);
}

module.exports = { addClient, broadcast, disconnectUser, sourceClientId, EVERYONE, TRANSACTION_VIEWERS };
