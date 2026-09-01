import { Request, Response, NextFunction } from 'express';
import { ManageCertificationScores } from '../../use-cases/certification/ManageCertificationScores';
import { ManageCertificate } from '../../use-cases/certification/ManageCertificate';
import { env } from '../../config/env';
import { z } from 'zod';

const updateSchema = z.object({
    additionalScore: z.record(z.string(), z.union([z.number().min(0).max(100), z.null()])).optional(),
    examScoreOverride: z.record(z.string().min(1), z.union([z.number().min(0).max(100), z.null()])).nullable().optional(),
}).strict();

const blastEmailSchema = z.object({
    examSubmissionId: z.string().uuid(),
}).strict();

export class CertificationScoreController {
    constructor(
        private manageCertificationScores: ManageCertificationScores,
        private manageCertificate: ManageCertificate
    ) { }

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Strict camelCase: reject legacy snake_case queries
            if (typeof (req.query as any).exam_submission_id === 'string' || typeof (req.query as any).examSubmissionId === 'string') {
                // examSubmissionId is deprecated, use examId
                return res.status(400).json({ error: 'Use examId (camelCase) query param' });
            }
            const examId = typeof req.query.examId === 'string' ? req.query.examId : undefined;
            if (examId) {
                try { z.string().uuid().parse(examId); } catch (e) { throw e; }
            }
            const search = typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined;
            // Also support alias q
            const searchAlias = typeof (req.query as any).q === 'string' ? (req.query as any).q.trim() || undefined : undefined;
            const finalSearch = search ?? searchAlias;
            const scores = await this.manageCertificationScores.getAll(examId, finalSearch);
            res.status(200).json(scores);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateSchema.parse(req.body);
            const score = await this.manageCertificationScores.update(req.params.id, {
                additionalScore: data.additionalScore,
                examScoreOverride: data.examScoreOverride,
            });
            res.status(200).json({ message: 'Certification score updated', score });
        } catch (error: any) {
            if (error.message === 'Certification score not found') {
                return res.status(404).json({ message: error.message });
            }
            if (error.message?.startsWith('Unknown additional score name') || error.message?.startsWith('Unknown section name')) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    };

    downloadPdf = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const { fullName, buffer } = await this.manageCertificate.getPdf(req.params.id);
            const safeName = fullName.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="certificate-${safeName || req.params.id}.pdf"`);
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        } catch (error: any) {
            if (error.message === 'Certification score not found' || error.message === 'User not found') {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    };

    blastEmail = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { examSubmissionId } = blastEmailSchema.parse(req.body);
            const { to, fullName, downloadUrl } = await this.manageCertificate.emailBySubmission(examSubmissionId, env.BASE_URL);
            res.status(200).json({
                message: 'Certificate email sent',
                to,
                fullName,
                downloadUrl,
            });
        } catch (error: any) {
            if (error.message === 'Certification score not found' || error.message === 'User not found') {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    };
}