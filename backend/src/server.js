import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`[Server] Voice Accountability API running in ${env.NODE_ENV} mode on port ${env.PORT}`);
});

// Graceful shutdown
const handleShutdown = (signal) => {
  console.log(`\n[Server] Received ${signal}. Closing HTTP server...`);
  server.close(() => {
    console.log('[Server] HTTP server closed gracefully.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

