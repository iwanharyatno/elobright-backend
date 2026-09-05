import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { EmailJobData, VerificationJobData, CertificateJobData, PasswordResetJobData } from './emailQueue';
import { verificationEmailTemplate, certificateEmailTemplate, passwordResetEmailTemplate } from '../infrastructure/email/emailTemplates';
import { queueLogger } from '../infrastructure/logger';
import { getRateLimitStatus, tryAcquireEmailSlot, removeEmailRecord } from './emailRateLimiter';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });
};

const processVerificationEmail = async (job: Job<VerificationJobData>): Promise<void> => {
  const { to, code, name } = job.data;
  const transporter = createTransporter();

  if (!env.SMTP_HOST) {
    throw new Error('SMTP is not configured');
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: 'Your Elobright email verification code',
    html: verificationEmailTemplate(code, name || 'there'),
  });
};

const processCertificateEmail = async (job: Job<CertificateJobData>): Promise<void> => {
  const { to, fullName, email, downloadUrl } = job.data;
  const transporter = createTransporter();

  if (!env.SMTP_HOST) {
    throw new Error('SMTP is not configured');
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: 'Your Elobright certificate is ready',
    html: certificateEmailTemplate(fullName, email, downloadUrl),
  });
};

const processPasswordResetEmail = async (job: Job<PasswordResetJobData>): Promise<void> => {
  const { to, name, resetUrl } = job.data;
  const transporter = createTransporter();

  if (!env.SMTP_HOST) {
    throw new Error('SMTP is not configured');
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: 'Reset your Elobright password',
    html: passwordResetEmailTemplate(resetUrl, name),
  });
};

export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    // Atomic tryAcquire — ensures only 2 per window succeed, rest are delayed; failed don't count (removed on catch)
    const acquire = await tryAcquireEmailSlot(job.id as string);
    if (!acquire.allowed) {
      const delay = Math.max(0, acquire.resetAt - Date.now()) + 1000;
      queueLogger.warn(`Email daily limit reached — delaying job to next window`, {
        jobId: job.id,
        type: job.data.type,
        to: (job.data as any).to,
        current: acquire.current,
        remaining: 0,
        limit: acquire.limit,
        resetAt: new Date(acquire.resetAt).toISOString(),
        delayMs: delay,
        window: acquire.window,
      });
      try {
        const token = (job as any).token;
        if (token) {
          await (job as any).moveToDelayed(Date.now() + delay, token);
        } else {
          await (job as any).moveToDelayed(Date.now() + delay);
        }
      } catch (e: any) {
        queueLogger.error(`Failed to move job to delayed`, {
          jobId: job.id,
          error: e.message,
          current: acquire.current,
          remaining: 0,
          limit: acquire.limit,
          resetAt: new Date(acquire.resetAt).toISOString(),
          window: acquire.window,
        });
        // Remove the acquired slot since we failed to delay properly and will throw
        try { await removeEmailRecord(job.id as string); } catch {}
      }
      throw new Error(`Email daily limit exceeded — delayed ${delay}ms until ${new Date(acquire.resetAt).toISOString()}`);
    }

    try {
      switch (job.data.type) {
        case 'verification':
          await processVerificationEmail(job as Job<VerificationJobData>);
          break;
        case 'certificate':
          await processCertificateEmail(job as Job<CertificateJobData>);
          break;
        case 'password-reset':
          await processPasswordResetEmail(job as Job<PasswordResetJobData>);
          break;
        default:
          throw new Error(`Unknown email job type: ${(job.data as any).type}`);
      }
    } catch (e: any) {
      // Failed sends must NOT count — remove the slot we just acquired
      try { await removeEmailRecord(job.id as string); } catch {}
      throw e;
    }
    // Success already counted via tryAcquire (atomic), no need to record again
  },
  { connection, lockDuration: 120000, lockRenewTime: 30000 }
);

emailWorker.on('completed', async (job: Job<EmailJobData>) => {
  try {
    const status = await getRateLimitStatus();
    queueLogger.info(`Job ${job.id} (${job.data.type}) completed`, {
      current: status.current,
      remaining: status.remaining,
      limit: status.limit,
      resetAt: new Date(status.resetAt).toISOString(),
      window: status.window,
    });
  } catch {
    queueLogger.info(`Job ${job.id} (${job.data.type}) completed`);
  }
});

emailWorker.on('failed', async (job: Job<EmailJobData> | undefined, err: Error) => {
  const isRateLimited = err.message.includes('Email daily limit exceeded');
  if (isRateLimited) {
    // Delayed due to rate limit — not a real failure, log as warn with quota info, never drop
    try {
      const status = await getRateLimitStatus();
      queueLogger.warn(`Job ${job?.id} delayed due to daily limit (will retry next window)`, {
        error: err.message,
        current: status.current,
        remaining: 0,
        limit: status.limit,
        resetAt: new Date(status.resetAt).toISOString(),
        window: status.window,
      });
      return;
    } catch {}
  }
  // Real failure (failed don't count toward limit per spec)
  try {
    const status = await getRateLimitStatus();
    queueLogger.error(`Job ${job?.id} failed`, {
      error: err.message,
      current: status.current,
      remaining: status.remaining,
      limit: status.limit,
      resetAt: new Date(status.resetAt).toISOString(),
      window: status.window,
    });
  } catch {
    queueLogger.error(`Job ${job?.id} failed`, { error: err.message });
  }
});

emailWorker.on('error', async (err: Error) => {
  try {
    const status = await getRateLimitStatus();
    queueLogger.error('Worker error', {
      error: err.message,
      current: status.current,
      remaining: status.remaining,
      limit: status.limit,
      resetAt: new Date(status.resetAt).toISOString(),
      window: status.window,
    });
  } catch {
    queueLogger.error('Worker error', { error: err.message });
  }
});

export const closeEmailWorker = async (): Promise<void> => {
  await emailWorker.close();
};