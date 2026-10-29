// Open Server-Sent Events connections, one per browser tab, with the signed-in user's role.
// Kept in memory, which is fine while there is a single API process.
const clients = new Map();

// Who may receive an event. Most events carry transaction details (quantities, customers),
// so by default only warehouse users and admins get them; item-only events go to everyone.
const WAREHOUSE_ROLES = ['admin', 'warehouse'];
const ALL_ROLES = ['admin', 'warehouse', 'encoder'];
const ENCODER_ROLES = ['encoder'];

function addClient(res, role) {
  clients.set(res, role);
  return () => clients.delete(res);
}

// Sends one event to every connected browser whose user has one of `roles`.
function broadcast(event, data, { roles = WAREHOUSE_ROLES } = {}) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [res, role] of clients) if (roles.includes(role)) res.write(message);
}

// The browser tab that made a request (see frontend api/client.js), so that tab can
// skip announcements about its own save.
function sourceClientId(req) {
  return String(req.get('X-Client-Id') ?? '').slice(0, 64);
}

module.exports = { addClient, broadcast, sourceClientId, ALL_ROLES, ENCODER_ROLES };
