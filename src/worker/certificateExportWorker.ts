import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { CertificateExportJobData, redisForExport, REDIS_PREFIX, REDIS_LOCK_KEY, TTL_SECONDS } from './certificateExportQueue';
import { queueLogger } from '../infrastructure/logger';
import fs from 'fs';
import path from 'path';

const connection = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
};

export type ExportState = 'generating' | 'archiving' | 'completed' | 'failed';

export interface CertificateExportProgress {
    exportId: string;
    examId: string;
    state: ExportState;
    generated: number;
    total: number;
    percentage: number;
    current: Record<string, any> | null;
    downloadUrl?: string;
    expiresAt?: number;
    error?: string;
}

const sanitizeFileName = (raw: string): string =>
    raw.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim() || 'certificate';

const processCertificateExport = async (job: Job<CertificateExportJobData>): Promise<CertificateExportProgress> => {
    const { exportId, examId } = job.data;
    queueLogger.info(`[CertificateExport] Starting ${exportId} exam ${examId}`);

    const { DrizzleCertificationScoreRepository } = await import('../interface-adapters/repositories/DrizzleCertificationScoreRepository');
    const { DrizzleUserRepository } = await import('../interface-adapters/repositories/DrizzleUserRepository');
    const { DrizzleStudentRepository } = await import('../interface-adapters/repositories/DrizzleStudentRepository');
    const { DrizzleExamSubmissionRepository } = await import('../interface-adapters/repositories/DrizzleExamSubmissionRepository');
    const { DrizzleExamSectionSubmissionRepository } = await import('../interface-adapters/repositories/DrizzleExamSectionSubmissionRepository');
    const { DrizzleExamSectionRepository } = await import('../interface-adapters/repositories/DrizzleExamSectionRepository');
    const { DrizzleQuestionRepository } = await import('../interface-adapters/repositories/DrizzleQuestionRepository');
    const { DrizzleCertificationAdditionalScoreRepository } = await import('../interface-adapters/repositories/DrizzleCertificationAdditionalScoreRepository');
    const { computeCertificateScore } = await import('../use-cases/certification/certificateComputation');
    const { createCertificatePdf } = await import('../infrastructure/pdf/certificatePdf');

    const certRepo = new DrizzleCertificationScoreRepository();
    const userRepo = new DrizzleUserRepository();
    const studentRepo = new DrizzleStudentRepository();
    const submissionRepo = new DrizzleExamSubmissionRepository();
    const sectionSubmissionRepo = new DrizzleExamSectionSubmissionRepository();
    const sectionRepo = new DrizzleExamSectionRepository();
    const questionRepo = new DrizzleQuestionRepository();
    const additionalRepo = new DrizzleCertificationAdditionalScoreRepository();

    const scores = await certRepo.findFiltered({ examId });
    const enriched = await Promise.all(scores.map(async s => {
        const sub = await submissionRepo.findById(s.examSubmissionId);
        return { score: s, submission: sub };
    }));
    const latestMap = new Map<string, typeof enriched[0]>();
    for (const item of enriched) {
        if (!item.submission) {
            latestMap.set(`no-sub-${item.score.id}`, item);
            continue;
        }
        const status: string = (item.submission as any).status;
        if (status !== 'submitted' && status !== 'finished' && status !== 'finished-late') {
            latestMap.set(`ongoing-${item.score.id}`, item);
            continue;
        }
        const key = `${item.score.userId}-${item.submission.examId}`;
        const existing = latestMap.get(key);
        if (!existing) {
            latestMap.set(key, item);
        } else {
            const existingTime = existing.submission?.startedAt ? new Date(existing.submission.startedAt as any).getTime() : 0;
            const currentTime = item.submission?.startedAt ? new Date(item.submission.startedAt as any).getTime() : 0;
            if (currentTime > existingTime || (currentTime === existingTime && (item.submission?.submittedAt ? new Date(item.submission.submittedAt as any).getTime() : 0) > (existing.submission?.submittedAt ? new Date(existing.submission.submittedAt as any).getTime() : 0))) {
                latestMap.set(key, item);
            }
        }
    }
    const deduped = Array.from(latestMap.values()).map(v => v.score);

    if (deduped.length === 0) {
        const msg = `No certification scores found for exam ${examId}`;
        queueLogger.warn(`[CertificateExport] ${msg} exportId=${exportId}`);
        throw new Error(msg);
    }

    const total = deduped.length;
    const baseDir = path.join(process.cwd(), 'tmp', 'exports');
    const pdfDir = path.join(baseDir, exportId);
    const zipPath = path.join(baseDir, `${exportId}.zip`);

    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    let generated = 0;

    const buildScoreData = async (score: typeof deduped[0]) => {
        const user = await userRepo.findById(score.userId);
        if (!user) throw new Error(`User not found for score ${score.id}`);
        const submission = await submissionRepo.findById(score.examSubmissionId);
        const examIdFromSubmission = submission?.examId ?? examId;
        const student = await studentRepo.findByUserId(score.userId);

        let sections: any[] = [];
        let weights: any[] = [];
        if (examIdFromSubmission) {
            const examSections = await sectionRepo.findByExamId(examIdFromSubmission);
            const sectionSubmissions = await sectionSubmissionRepo.findBySubmissionId(score.examSubmissionId);
            const totalBySection = new Map(sectionSubmissions.map(ss => [(ss as any).examSectionId, (ss as any).totalScore || 0]));
            weights = examSections.map(s => ({ examSectionId: (s as any).id, weight: (s as any).weight ?? null }));
            sections = await Promise.all(examSections.map(async (s) => {
                const questions = await questionRepo.findBySectionId((s as any).id);
                const maxPoints = (questions as any[]).reduce((sum, q) => sum + ((q as any).points || 0), 0);
                return { examSectionId: (s as any).id, title: (s as any).title ?? null, totalScore: totalBySection.get((s as any).id) ?? 0, maxPoints };
            }));
        }
        const configs = await additionalRepo.findAll();
        const { finalScore } = computeCertificateScore({
            sections,
            weights,
            overrides: (score as any).examScoreOverride ?? null,
            additionalScore: (score as any).additionalScore,
            additionalConfigs: (configs as any[]).map(c => ({ scoreName: (c as any).scoreName, weight: (c as any).weight })),
        });

        const fullName = (user as any).fullName || (user as any).email;
        return { fullName, finalScore, user: { id: (user as any).id, email: (user as any).email, fullName: (user as any).fullName, role: (user as any).role, phoneNumber: (user as any).phoneNumber }, student, submission, userRaw: user };
    };

    try {
        for (let i = 0; i < deduped.length; i++) {
            const score = deduped[i];
            const enrichedScore = await (async () => {
                try {
                    const { fullName: _fn, finalScore: _fs, ...rest } = await buildScoreData(score);
                    const submission = rest.submission;
                    const student = rest.student;
                    return {
                        ...score,
                        user: rest.user,
                        originalExamScore: undefined as any,
                        totalScore: undefined as any,
                        exam: undefined as any,
                        student: student || undefined,
                        scores: undefined as any,
                        overrides: undefined as any,
                        groupNumber: (submission as any)?.groupNumber ?? null,
                        degreeProgram: (student as any)?.degreeProgram ?? null,
                    };
                } catch {
                    return { ...score, user: undefined };
                }
            })();

            const { fullName, finalScore } = await buildScoreData(score);

            const pdfBuffer = await createCertificatePdf({ fullName, finalScore });

            const student = await studentRepo.findByUserId(score.userId);
            const studentIdRaw = (student as any)?.studentId as string | undefined;
            const fileName = studentIdRaw ? sanitizeFileName(studentIdRaw) : sanitizeFileName(`user-${score.userId}`);
            const filePath = path.join(pdfDir, `${fileName}.pdf`);
            await fs.promises.writeFile(filePath, pdfBuffer);

            generated++;
            const percentage = total > 0 ? Math.round((generated / total) * 100) : 0;
            await job.updateProgress({
                exportId,
                examId,
                state: 'generating' as ExportState,
                generated,
                total,
                percentage,
                current: enrichedScore,
            });
        }

        await job.updateProgress({
            exportId,
            examId,
            state: 'archiving' as ExportState,
            generated,
            total,
            percentage: 100,
            current: null,
        });
        queueLogger.info(`[CertificateExport] Archiving ${exportId} ${generated}/${total}`);

        const { ZipArchive } = await import('archiver');
        const output = fs.createWriteStream(zipPath);
        const archive: any = new (ZipArchive as any)({ zlib: { level: 9 } });

        await new Promise<void>((resolve, reject) => {
            output.on('close', () => resolve());
            archive.on('error', (err: Error) => reject(err));
            archive.pipe(output);
            archive.directory(pdfDir, false);
            void archive.finalize();
        });

        queueLogger.info(`[CertificateExport] Archived ${exportId} size=${archive.pointer()} bytes`);

        try {
            if (fs.existsSync(pdfDir)) {
                await fs.promises.rm(pdfDir, { recursive: true, force: true });
            }
        } catch {}

        const expiresAt = Date.now() + TTL_SECONDS * 1000;
        const downloadUrl = `/api/certification-scores/mass-download/${exportId}/download`;
        const meta = JSON.stringify({ downloadUrl, expiresAt, examId, exportId, total });
        await redisForExport.set(`${REDIS_PREFIX}${exportId}`, meta, 'EX', TTL_SECONDS);

        const result: CertificateExportProgress = {
            exportId,
            examId,
            state: 'completed',
            generated,
            total,
            percentage: 100,
            current: null,
            downloadUrl,
            expiresAt,
        };

        const ttlMs = TTL_SECONDS * 1000;
        setTimeout(async () => {
            try { if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath); } catch {}
            try { await redisForExport.del(`${REDIS_PREFIX}${exportId}`); } catch {}
        }, ttlMs).unref?.();

        queueLogger.info(`[CertificateExport] Completed ${exportId} ${generated}/${total} url=${downloadUrl}`);

        try { await redisForExport.del(REDIS_LOCK_KEY); } catch {}

        return result;
    } catch (e: any) {
        try { if (fs.existsSync(pdfDir)) await fs.promises.rm(pdfDir, { recursive: true, force: true }); } catch {}
        try { if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath); } catch {}
        try { await redisForExport.del(REDIS_LOCK_KEY); } catch {}
        queueLogger.error(`[CertificateExport] Failed ${exportId}: ${e.message}`, { examId, error: e.stack });
        throw e;
    }
};

export const certificateExportWorker = new Worker<CertificateExportJobData>(
    'certificate-export',
    async (job: Job<CertificateExportJobData>) => {
        return await processCertificateExport(job);
    },
    { connection, concurrency: 1 }
);

certificateExportWorker.on('completed', (job: Job<CertificateExportJobData>) => {
    queueLogger.info(`Certificate export ${job.id} completed`, { exportId: job.data.exportId });
});

certificateExportWorker.on('failed', (job: Job<CertificateExportJobData> | undefined, err: Error) => {
    queueLogger.error(`Certificate export ${job?.id} failed`, { error: err.message, exportId: job?.data.exportId });
    if (job?.data.exportId) {
        const baseDir = path.join(process.cwd(), 'tmp', 'exports');
        const pdfDir = path.join(baseDir, job.data.exportId);
        const zipPath = path.join(baseDir, `${job.data.exportId}.zip`);
        if (fs.existsSync(pdfDir)) fs.promises.rm(pdfDir, { recursive: true, force: true }).catch(() => {});
        if (fs.existsSync(zipPath)) fs.promises.unlink(zipPath).catch(() => {});
        redisForExport.del(REDIS_LOCK_KEY).catch(() => {});
        redisForExport.del(`${REDIS_PREFIX}${job.data.exportId}`).catch(() => {});
    }
});

certificateExportWorker.on('error', (err: Error) => {
    queueLogger.error('Certificate export worker error', { error: err.message });
});

certificateExportWorker.on('progress', (job: Job<CertificateExportJobData>, progress: any) => {
    queueLogger.debug(`Certificate export progress ${job.id}: ${JSON.stringify(progress)}`);
});

export const closeCertificateExportWorker = async (): Promise<void> => {
    await certificateExportWorker.close();
};


