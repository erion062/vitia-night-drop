// Server-Sent Events hub. Each authenticated browser keeps one /api/stream connection open.
const clients = new Set();

export function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx / LiteSpeed)
  });
  res.write('retry: 3000\n\n');
  const client = { res, user: req.user };
  clients.add(client);
  write(client, 'hello', { role: req.user.role });
  req.on('close', () => clients.delete(client));
}

function write(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`);
  } catch {
    clients.delete(client);
  }
}

function send(filter, event, data) {
  for (const c of clients) if (filter(c)) write(c, event, data);
}

export const toAll = (event, data) => send(() => true, event, data);
export const toAdmins = (event, data) => send((c) => c.user.role === 'admin', event, data);
export const toUser = (userId, event, data) => send((c) => c.user.id === userId, event, data);
export const toUsers = (userIds, event, data) => {
  const set = new Set(userIds);
  send((c) => set.has(c.user.id), event, data);
};

setInterval(() => {
  for (const c of clients) {
    try {
      c.res.write(': ping\n\n');
    } catch {
      clients.delete(c);
    }
  }
}, 20000).unref();
