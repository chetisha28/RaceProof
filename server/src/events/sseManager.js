import { eventEmitter, DOMAIN_EVENTS } from './eventEmitter.js';

class SSEManager {
  constructor() {
    this.clients = new Set();
    this.setupEventListeners();
  }

  addClient(res, userId = null) {
    const client = {
      id: Math.random().toString(36).substring(2, 9),
      res,
      userId,
      connectedAt: new Date(),
    };

    this.clients.add(client);

    // Send initial handshake
    this.sendEventToClient(client, 'connected', {
      clientId: client.id,
      timestamp: new Date().toISOString(),
      message: 'Real-time SSE stream established.',
    });

    // Cleanup on client disconnect
    res.on('close', () => {
      this.clients.delete(client);
    });

    return client;
  }

  sendEventToClient(client, eventType, data) {
    try {
      client.res.write(`event: ${eventType}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      this.clients.delete(client);
    }
  }

  broadcast(eventType, data) {
    for (const client of this.clients) {
      this.sendEventToClient(client, eventType, data);
    }
  }

  sendHeartbeats() {
    for (const client of this.clients) {
      try {
        client.res.write(': heartbeat\n\n');
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  setupEventListeners() {
    // Forward all domain events to connected SSE clients
    Object.values(DOMAIN_EVENTS).forEach((eventName) => {
      eventEmitter.on(eventName, (payload) => {
        this.broadcast(eventName, payload);
      });
    });

    // Heartbeat every 25 seconds
    setInterval(() => {
      this.sendHeartbeats();
    }, 25000);
  }

  getConnectedCount() {
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();

