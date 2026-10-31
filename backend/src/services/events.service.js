// Open Server-Sent Events connections, one per browser tab, with the signed-in user's ID,
// role and cost center (none for admins).
// Kept in memory, which is fine while there is a single API process.
const clients = new Map();

// Who may receive an event. Most events carry transaction details (quantities, customers),
// so by default only warehouse users and admins get them; item-only events go to everyone.
const WAREHOUSE_ROLES = ['admin', 'warehouse'];
const ALL_ROLES = ['admin', 'warehouse', 'encoder'];
const ENCODER_ROLES = ['encoder'];

function addClient(res, { userId, role, costCenter }) {
  clients.set(res, { userId: String(userId), role, costCenter });
  return () => clients.delete(res);
}

// Ends a user's open connections, e.g. when their account is disabled, so they stop getting
// live updates at once. Their browser's reconnect is refused (401), and their next request
// signs them out.
function disconnectUser(userId) {
  for (const [res, client] of clients) if (client.userId === String(userId)) res.end();
}

// Sends one event about `costCenter`'s data to every connected browser whose user has one of
// `roles` and works in that cost center. Admins get every cost center's events, tagged with
// costCenter, and skip the ones for a cost center they aren't viewing (frontend useLiveUpdates.js).
function broadcast(event, data, { roles = WAREHOUSE_ROLES, costCenter }) {
  const message = `event: ${event}\ndata: ${JSON.stringify({ ...data, costCenter })}\n\n`;
  for (const [res, client] of clients) {
    if (!roles.includes(client.role)) continue;
    if (client.role !== 'admin' && client.costCenter !== costCenter) continue;
    res.write(message);
  }
}

// The browser tab that made a request (see frontend api/client.js), so that tab can
// skip announcements about its own save.
function sourceClientId(req) {
  return String(req.get('X-Client-Id') ?? '').slice(0, 64);
}

module.exports = { addClient, broadcast, disconnectUser, sourceClientId, ALL_ROLES, ENCODER_ROLES };
