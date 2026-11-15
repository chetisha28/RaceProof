import { sseManager } from '../events/sseManager.js';

export const subscribe = (req, res) => {
  const origin = req.headers.origin;
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  // Set SSE headers
  res.writeHead(200, headers);

  res.flushHeaders?.();

  const userId = req.user ? req.user.id : null;
  sseManager.addClient(res, userId);
};

