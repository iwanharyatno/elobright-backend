import { Queue, Worker, Job } from 'bullmq';
import { env } from '../config/env';

export type EmailJobType = 'verification' | 'certificate' | 'password-reset';

export interface VerificationJobData {
  type: 'verification';
  to: string;
  code: string;
  name?: string;
}

export interface CertificateJobData {
  type: 'certificate';
  to: string;
  fullName: string;
  email: string;
  downloadUrl: string;
}

export interface PasswordResetJobData {
  type: 'password-reset';
  to: string;
  name?: string;
  resetUrl: string;
}

export type EmailJobData = VerificationJobData | CertificateJobData | PasswordResetJobData;

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const emailQueue = new Queue<EmailJobData>('email', { connection });

export const addVerificationEmailJob = async (data: Omit<VerificationJobData, 'type'>): Promise<void> => {
  await emailQueue.add('verification', { type: 'verification', ...data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
};

export const addCertificateEmailJob = async (data: Omit<CertificateJobData, 'type'>): Promise<void> => {
  await emailQueue.add('certificate', { type: 'certificate', ...data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
};

export const addPasswordResetEmailJob = async (data: Omit<PasswordResetJobData, 'type'>): Promise<void> => {
  await emailQueue.add('password-reset', { type: 'password-reset', ...data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
};

export const closeEmailQueue = async (): Promise<void> => {
  await emailQueue.close();
};