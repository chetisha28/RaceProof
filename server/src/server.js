import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/database.js';

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 RaceProof Server listening on port ${PORT}`);
  console.log(`🛡️  Environment: ${env.NODE_ENV}`);
  console.log(`📡 Real-Time SSE endpoint: http://localhost:${PORT}/api/sse`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
const handleGracefulShutdown = async (signal) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('✅ Database connections closed. Process terminating.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('Forcefully terminating server after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

