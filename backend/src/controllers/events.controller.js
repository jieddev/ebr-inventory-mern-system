const { addClient } = require('../services/events.service');

// Proxies and routers drop connections that stay silent too long.
const HEARTBEAT_MS = 25_000;

// GET /api/events — keeps the response open and pushes changes as they happen,
// so every PC sees new items and transactions without refreshing.
function streamEvents(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stops nginx, if ever put in front, from buffering the stream
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n'); // the browser reconnects 3 s after a drop

  const removeClient = addClient(res, {
    userId: req.user._id,
    role: req.user.role,
    permissions: req.user.permissions,
    costCenter: req.costCenter,
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient();
  });
}

module.exports = { streamEvents };
