import { sseManager } from '../events/sseManager.js';

export const subscribe = (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  res.flushHeaders?.();

  const userId = req.user ? req.user.id : null;
  sseManager.addClient(res, userId);
};

