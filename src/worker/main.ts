import { emailWorker } from './emailWorker';
import { closeEmailQueue } from './emailQueue';

console.log('[EmailWorker] Starting email worker process...');

const shutdown = async (signal: string) => {
  console.log(`[EmailWorker] Received ${signal}, shutting down gracefully...`);
  await emailWorker.close();
  await closeEmailQueue();
  console.log('[EmailWorker] Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[EmailWorker] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[EmailWorker] Unhandled rejection:', reason);
  process.exit(1);
});

console.log('[EmailWorker] Email worker is running and listening for jobs...');