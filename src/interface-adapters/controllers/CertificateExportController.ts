import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { CertificateExportService } from '../../use-cases/certification/CertificateExportService';
import { certificateExportQueueEvents, getCertificateExportJob, redisForExport, REDIS_PREFIX, REDIS_DL_TOKEN_PREFIX, DL_TOKEN_TTL } from '../../worker/certificateExportQueue';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../../infrastructure/web/middleware/authMiddleware';

const triggerSchema = z.object({
    examId: z.string().uuid(),
}).strict();

export class CertificateExportController {
    constructor(private certificateExportService: CertificateExportService) {}

    triggerExport = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authReq = req as AuthRequest;
            if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

            const parsed = triggerSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Validation Error', details: parsed.error.issues });
            }

            const { exportId } = await this.certificateExportService.triggerExport({
                examId: parsed.data.examId,
                triggeredBy: authReq.user.userId,
            });

            return res.status(202).json({
                message: 'Certificate export queued',
                exportId,
                examId: parsed.data.examId,
            });
        } catch (error: any) {
            if (error.message === 'Exam not found') return res.status(404).json({ error: error.message });
            if (error.message === 'Another export is already in progress') return res.status(409).json({ error: error.message });
            next(error);
        }
    };

    getProgress = async (req: Request<{ exportId: string }>, res: Response, next: NextFunction) => {
        try {
            const { exportId } = req.params;
            const job = await getCertificateExportJob(exportId);
            if (!job) return res.status(404).json({ error: 'Export job not found' });

            const state = await job.getState();
            const progress = job.progress as any;
            const returnvalue = (job as any).returnvalue;
            let downloadUrl: string | undefined;
            let expiresAt: number | undefined;

            if (state === 'completed' && returnvalue) {
                downloadUrl = returnvalue.downloadUrl;
                expiresAt = returnvalue.expiresAt;
            } else {
                const metaRaw = await redisForExport.get(`${REDIS_PREFIX}${exportId}`);
                if (metaRaw) {
                    try {
                        const meta = JSON.parse(metaRaw);
                        downloadUrl = meta.downloadUrl;
                        expiresAt = meta.expiresAt;
                    } catch {}
                }
            }

            const generated = progress?.generated ?? 0;
            const total = progress?.total ?? returnvalue?.total ?? 0;
            const percentage = total > 0 ? Math.round((generated / total) * 100) : 0;

            let resolvedState: string;
            if (state === 'completed') resolvedState = 'completed';
            else if (state === 'failed') resolvedState = 'failed';
            else resolvedState = progress?.state ?? 'generating';

            return res.status(200).json({
                exportId,
                state: resolvedState,
                generated,
                total,
                percentage,
                current: progress?.current ?? null,
                downloadUrl,
                expiresAt,
                failedReason: job.failedReason,
            });
        } catch (error) {
            next(error);
        }
    };

    streamProgress = async (req: Request<{ exportId: string }>, res: Response, next: NextFunction) => {
        try {
            const { exportId } = req.params;
            const job = await getCertificateExportJob(exportId);
            if (!job) return res.status(404).json({ error: 'Export job not found' });

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            });

            const send = (data: any) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            const state = await job.getState();
            const progress = job.progress as any;
            const total = progress?.total ?? 0;
            const generated = progress?.generated ?? 0;
            const percentage = total > 0 ? Math.round((generated / total) * 100) : 0;

            let resolvedInitState: string;
            if (state === 'completed') resolvedInitState = 'completed';
            else if (state === 'failed') resolvedInitState = 'failed';
            else resolvedInitState = progress?.state ?? 'generating';

            send({
                event: 'init',
                exportId,
                state: resolvedInitState,
                generated,
                total,
                percentage,
                current: progress?.current ?? null,
                progress,
            });

            if (state === 'completed' || state === 'failed') {
                const rv = (job as any).returnvalue;
                send({ event: state, exportId, state, generated: rv?.generated ?? generated, total: rv?.total ?? total, percentage: 100, current: null, returnvalue: rv, failedReason: job.failedReason });
                res.end();
                return;
            }

            const onProgress = ({ jobId, data }: { jobId: string; data: any }) => {
                if (jobId === exportId) {
                    const p = data as any;
                    const pct = p?.total > 0 ? Math.round(((p.generated ?? 0) / p.total) * 100) : 0;
                    send({
                        event: 'progress',
                        exportId,
                        state: p?.state ?? 'generating',
                        generated: p?.generated ?? 0,
                        total: p?.total ?? 0,
                        percentage: pct,
                        current: p?.current ?? null,
                        progress: p,
                    });
                }
            };

            const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
                if (jobId === exportId) {
                    const rv = returnvalue as any;
                    send({
                        event: 'completed',
                        exportId,
                        state: 'completed',
                        generated: rv?.generated ?? rv?.total ?? 0,
                        total: rv?.total ?? 0,
                        percentage: 100,
                        current: null,
                        downloadUrl: rv?.downloadUrl,
                        expiresAt: rv?.expiresAt,
                        returnvalue: rv,
                    });
                    res.end();
                    cleanup();
                }
            };

            const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
                if (jobId === exportId) {
                    send({ event: 'failed', exportId, failedReason });
                    res.end();
                    cleanup();
                }
            };

            certificateExportQueueEvents.on('progress', onProgress);
            certificateExportQueueEvents.on('completed', onCompleted);
            certificateExportQueueEvents.on('failed', onFailed);

            const interval = setInterval(async () => {
                const j = await getCertificateExportJob(exportId);
                if (!j) {
                    send({ event: 'not_found', exportId });
                    clearInterval(interval);
                    res.end();
                    cleanup();
                    return;
                }
                const s = await j.getState();
                if (s === 'completed' || s === 'failed') {
                    const rv = (j as any).returnvalue;
                    const p = j.progress as any;
                    const gen = rv?.generated ?? p?.generated ?? 0;
                    const tot = rv?.total ?? p?.total ?? 0;
                    send({
                        event: s,
                        exportId,
                        state: rv?.state ?? (s === 'completed' ? 'completed' : 'failed'),
                        generated: gen,
                        total: tot,
                        percentage: tot > 0 ? Math.round((gen / tot) * 100) : 0,
                        current: null,
                        downloadUrl: rv?.downloadUrl,
                        expiresAt: rv?.expiresAt,
                        returnvalue: rv,
                        failedReason: j.failedReason,
                    });
                    clearInterval(interval);
                    res.end();
                    cleanup();
                }
            }, 2000);

            const cleanup = () => {
                certificateExportQueueEvents.off('progress', onProgress);
                certificateExportQueueEvents.off('completed', onCompleted);
                certificateExportQueueEvents.off('failed', onFailed);
                clearInterval(interval);
            };

            req.on('close', () => {
                cleanup();
                res.end();
            });
        } catch (error) {
            next(error);
        }
    };

    requestDownload = async (req: Request<{ exportId: string }>, res: Response, next: NextFunction) => {
        try {
            const authReq = req as AuthRequest;
            if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

            const { exportId } = req.params;

            const metaRaw = await redisForExport.get(`${REDIS_PREFIX}${exportId}`);
            if (!metaRaw) {
                const job = await getCertificateExportJob(exportId);
                if (!job) return res.status(404).json({ error: 'Export not found' });
                const state = await job.getState();
                if (state !== 'completed') return res.status(404).json({ error: 'Export not ready yet' });
            }

            if (metaRaw) {
                try {
                    const meta = JSON.parse(metaRaw);
                    if (meta.expiresAt && Date.now() > meta.expiresAt) {
                        return res.status(410).json({ error: 'Export has expired' });
                    }
                } catch {}
            }

            const zipPath = path.join(process.cwd(), 'tmp', 'exports', `${exportId}.zip`);
            if (!fs.existsSync(zipPath)) {
                return res.status(404).json({ error: 'Archive file not found or expired' });
            }

            const token = crypto.randomBytes(32).toString('hex');
            await redisForExport.set(`${REDIS_DL_TOKEN_PREFIX}${token}`, exportId, 'EX', DL_TOKEN_TTL);

            const expiresAt = Date.now() + DL_TOKEN_TTL * 1000;
            const downloadUrl = `/api/certification-scores/mass-download/${exportId}/download?token=${token}`;

            return res.status(200).json({
                downloadUrl,
                expiresAt,
                expiresInSeconds: DL_TOKEN_TTL,
            });
        } catch (error) {
            next(error);
        }
    };

    downloadArchive = async (req: Request<{ exportId: string }>, res: Response, next: NextFunction) => {
        try {
            const { exportId } = req.params;
            const token = typeof req.query.token === 'string' ? req.query.token : undefined;

            if (token) {
                const storedExportId = await redisForExport.get(`${REDIS_DL_TOKEN_PREFIX}${token}`);
                if (!storedExportId || storedExportId !== exportId) {
                    return res.status(401).json({ error: 'Invalid or expired download token' });
                }
                await redisForExport.del(`${REDIS_DL_TOKEN_PREFIX}${token}`);
            } else {
                const authReq = req as AuthRequest;
                if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
            }

            const metaRaw = await redisForExport.get(`${REDIS_PREFIX}${exportId}`);
            if (!metaRaw) {
                const job = await getCertificateExportJob(exportId);
                if (!job) return res.status(404).json({ error: 'Export not found or expired' });
                const state = await job.getState();
                if (state !== 'completed') return res.status(404).json({ error: 'Export not ready yet' });
            }

            let meta: any = null;
            if (metaRaw) {
                try { meta = JSON.parse(metaRaw); } catch {}
                if (meta && meta.expiresAt && Date.now() > meta.expiresAt) {
                    return res.status(410).json({ error: 'Download link has expired' });
                }
            }

            const zipPath = path.join(process.cwd(), 'tmp', 'exports', `${exportId}.zip`);
            if (!fs.existsSync(zipPath)) {
                return res.status(404).json({ error: 'Archive file not found or expired' });
            }

            const stat = await fs.promises.stat(zipPath);
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="certificates-${exportId}.zip"`);
            res.setHeader('Content-Length', String(stat.size));

            const stream = fs.createReadStream(zipPath);
            stream.pipe(res);
            stream.on('error', (err: Error) => {
                if (!res.headersSent) return next(err);
                res.end();
            });
        } catch (error) {
            next(error);
        }
    };
}
