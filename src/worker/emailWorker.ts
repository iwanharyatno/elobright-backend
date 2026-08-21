import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { EmailJobData, VerificationJobData, CertificateJobData } from './emailQueue';
import { verificationEmailTemplate, certificateEmailTemplate } from '../infrastructure/email/emailTemplates';
import { queueLogger } from '../infrastructure/logger';

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

export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    switch (job.data.type) {
      case 'verification':
        await processVerificationEmail(job as Job<VerificationJobData>);
        break;
      case 'certificate':
        await processCertificateEmail(job as Job<CertificateJobData>);
        break;
      default:
        throw new Error(`Unknown email job type: ${(job.data as any).type}`);
    }
  },
  { connection }
);

emailWorker.on('completed', (job: Job<EmailJobData>) => {
  queueLogger.info(`Job ${job.id} (${job.data.type}) completed`);
});

emailWorker.on('failed', (job: Job<EmailJobData> | undefined, err: Error) => {
  queueLogger.error(`Job ${job?.id} failed`, { error: err.message });
});

emailWorker.on('error', (err: Error) => {
  queueLogger.error('Worker error', { error: err.message });
});

export const closeEmailWorker = async (): Promise<void> => {
  await emailWorker.close();
};