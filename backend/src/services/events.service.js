// Open Server-Sent Events connections, one per browser tab.
// Kept in memory, which is fine while there is a single API process.
const clients = new Set();

function addClient(res) {
  clients.add(res);
  return () => clients.delete(res);
}

// Sends one event to every connected browser.
function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(message);
}

// The browser tab that made a request (see frontend api/client.js), so that tab can
// skip announcements about its own save.
function sourceClientId(req) {
  return String(req.get('X-Client-Id') ?? '').slice(0, 64);
}

module.exports = { addClient, broadcast, sourceClientId };
