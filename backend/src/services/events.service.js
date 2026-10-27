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

module.exports = { addClient, broadcast };
