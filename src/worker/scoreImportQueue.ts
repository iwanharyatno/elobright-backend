import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/env';

export interface ScoreImportJobData {
    type: 'score-import';
    importId: string;
    filePath: string;
    examId: string;
    uploadedBy: number;
    originalName: string;
    totalRows?: number;
    warnings?: string[];
}

const connection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

export const scoreImportQueue = new Queue<ScoreImportJobData>('score-import', { connection });

export const scoreImportQueueEvents = new QueueEvents('score-import', { connection });

export const addScoreImportJob = async (data: Omit<ScoreImportJobData, 'type'>) => {
    const job = await scoreImportQueue.add('score-import', { type: 'score-import', ...data }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 20,
        removeOnFail: 20,
        jobId: data.importId,
    });
    return job;
};

export const getScoreImportJob = async (importId: string) => {
    return scoreImportQueue.getJob(importId);
};

export const isImportActiveForExam = async (examId: string): Promise<boolean> => {
    const active = await scoreImportQueue.getActive();
    const waiting = await scoreImportQueue.getWaiting();
    const delayed = await scoreImportQueue.getDelayed();
    const all = [...active, ...waiting, ...delayed];
    return all.some(j => j.data.examId === examId);
};

export const closeScoreImportQueue = async (): Promise<void> => {
    await scoreImportQueueEvents.close();
    await scoreImportQueue.close();
};
