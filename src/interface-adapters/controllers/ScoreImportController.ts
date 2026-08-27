import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ScoreImportService } from '../../use-cases/certification/ScoreImportService';
import { scoreImportQueue, scoreImportQueueEvents, getScoreImportJob } from '../../worker/scoreImportQueue';
import { AuthRequest } from '../../infrastructure/web/middleware/authMiddleware';

const importBodySchema = z.object({
    examId: z.string().uuid(),
});

export class ScoreImportController {
    constructor(private scoreImportService: ScoreImportService) {}

    importScores = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authReq = req as AuthRequest;
            if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

            const parsed = importBodySchema.safeParse(req.body);
            if (!parsed.success) {
                // Cleanup uploaded file if validation fails
                const file = (req as any).file as Express.Multer.File | undefined;
                if (file) {
                    const fs = await import('fs');
                    try { if (fs.existsSync(file.path)) await fs.promises.unlink(file.path); } catch {}
                }
                return res.status(400).json({ error: 'Validation Error', details: parsed.error.issues });
            }
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) {
                return res.status(400).json({ error: 'File is required (field name: file)' });
            }

            const result = await this.scoreImportService.validateAndEnqueue({
                examId: parsed.data.examId,
                filePath: file.path,
                originalName: file.originalname,
                uploadedBy: authReq.user.userId,
            });

            res.status(202).json({
                message: 'Import queued',
                importId: result.importId,
                totalRows: result.totalRows,
                warnings: result.warnings,
            });
        } catch (error: any) {
            // Cleanup file on error if exists
            const file = (req as any).file as Express.Multer.File | undefined;
            if (file) {
                const fs = await import('fs');
                try { if (fs.existsSync(file.path)) await fs.promises.unlink(file.path); } catch {}
            }
            if (error.message === 'Exam not found') return res.status(404).json({ error: error.message });
            if (error.message === 'NIM column is required' || error.message.startsWith('Failed to read file') || error.message.startsWith('Invalid file type')) {
                return res.status(400).json({ error: error.message });
            }
            if (error.message === 'Import already in progress for this exam') {
                return res.status(409).json({ error: error.message });
            }
            next(error);
        }
    };

    getProgress = async (req: Request<{ importId: string }>, res: Response, next: NextFunction) => {
        try {
            const { importId } = req.params;
            const job = await getScoreImportJob(importId);
            if (!job) return res.status(404).json({ error: 'Import job not found' });
            const state = await job.getState();
            const progress = job.progress as any;
            const returnvalue = (job as any).returnvalue;
            res.status(200).json({
                importId,
                state,
                progress,
                returnvalue,
                failedReason: job.failedReason,
                stacktrace: job.stacktrace,
            });
        } catch (error) {
            next(error);
        }
    };

    streamProgress = async (req: Request<{ importId: string }>, res: Response, next: NextFunction) => {
        try {
            const { importId } = req.params;
            const job = await getScoreImportJob(importId);
            if (!job) return res.status(404).json({ error: 'Import job not found' });

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            });

            const send = (data: any) => {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            // Send initial state
            const initialState = await job.getState();
            const initialProgress = job.progress as any;
            send({ event: 'init', importId, state: initialState, progress: initialProgress });

            // Listen to QueueEvents for progress
            const onProgress = ({ jobId, data }: { jobId: string; data: any }) => {
                if (jobId === importId) {
                    send({ event: 'progress', importId, data });
                }
            };
            const onCompleted = ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
                if (jobId === importId) {
                    send({ event: 'completed', importId, returnvalue });
                    res.end();
                    cleanup();
                }
            };
            const onFailed = ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
                if (jobId === importId) {
                    send({ event: 'failed', importId, failedReason });
                    res.end();
                    cleanup();
                }
            };

            scoreImportQueueEvents.on('progress', onProgress);
            scoreImportQueueEvents.on('completed', onCompleted);
            scoreImportQueueEvents.on('failed', onFailed);

            // Fallback polling every 2s to ensure client gets updates even if events missed
            const interval = setInterval(async () => {
                const j = await getScoreImportJob(importId);
                if (!j) {
                    send({ event: 'not_found' });
                    clearInterval(interval);
                    res.end();
                    cleanup();
                    return;
                }
                const state = await j.getState();
                if (state === 'completed' || state === 'failed') {
                    const rv = (j as any).returnvalue;
                    send({ event: state, importId, state, progress: j.progress, returnvalue: rv, failedReason: j.failedReason });
                    clearInterval(interval);
                    res.end();
                    cleanup();
                }
            }, 2000);

            const cleanup = () => {
                scoreImportQueueEvents.off('progress', onProgress);
                scoreImportQueueEvents.off('completed', onCompleted);
                scoreImportQueueEvents.off('failed', onFailed);
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
}
