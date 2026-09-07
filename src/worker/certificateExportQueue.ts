import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/env';
import Redis from 'ioredis';

export const REDIS_PREFIX = 'cert-export:';
export const REDIS_LOCK_KEY = 'cert-export:lock';
export const REDIS_DL_TOKEN_PREFIX = 'cert-export-dlt:';
export const TTL_SECONDS = 3600;
export const DL_TOKEN_TTL = 30;

export const redisForExport = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: false,
});

redisForExport.on('error', () => {});

export interface CertificateExportJobData {
    type: 'certificate-export';
    exportId: string;
    examId: string;
    triggeredBy: number;
}

const connection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

export const certificateExportQueue = new Queue<CertificateExportJobData>('certificate-export', { connection });

export const certificateExportQueueEvents = new QueueEvents('certificate-export', { connection });

export const addCertificateExportJob = async (data: Omit<CertificateExportJobData, 'type'>) => {
    const job = await certificateExportQueue.add('certificate-export', { type: 'certificate-export', ...data }, {
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 20,
        jobId: data.exportId,
    });
    return job;
};

export const getCertificateExportJob = async (exportId: string) => {
    return certificateExportQueue.getJob(exportId);
};

export const isExportActive = async (): Promise<boolean> => {
    const active = await certificateExportQueue.getActive();
    const waiting = await certificateExportQueue.getWaiting();
    const delayed = await certificateExportQueue.getDelayed();
    const all = [...active, ...waiting, ...delayed];
    return all.length > 0;
};

export const closeCertificateExportQueue = async (): Promise<void> => {
    await certificateExportQueueEvents.close();
    await certificateExportQueue.close();
    await redisForExport.quit().catch(() => redisForExport.disconnect());
};
