import { emailWorker } from './emailWorker';
import { closeEmailQueue } from './emailQueue';
import { scoreImportWorker } from './scoreImportWorker';
import { closeScoreImportQueue } from './scoreImportQueue';
import { certificateExportWorker } from './certificateExportWorker';
import { closeCertificateExportQueue } from './certificateExportQueue';
import { closeEmailRateLimiter } from './emailRateLimiter';

console.log('[Worker] Starting worker processes...');

const shutdown = async (signal: string) => {
  console.log(`[Worker] Received ${signal}, shutting down gracefully...`);
  await emailWorker.close();
  await scoreImportWorker.close();
  await certificateExportWorker.close();
  await closeEmailQueue();
  await closeScoreImportQueue();
  await closeCertificateExportQueue();
  await closeEmailRateLimiter();
  console.log('[Worker] Shutdown complete');
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

console.log('[Worker] Email, Score Import and Certificate Export workers are running and listening for jobs...');