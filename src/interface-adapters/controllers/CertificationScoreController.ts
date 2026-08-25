import { Request, Response, NextFunction } from 'express';
import { ManageCertificationScores } from '../../use-cases/certification/ManageCertificationScores';
import { ManageCertificate } from '../../use-cases/certification/ManageCertificate';
import { env } from '../../config/env';
import { z } from 'zod';

const updateSchema = z.object({
    additional_score: z.record(z.string(), z.number().min(0).max(100)).optional(),
    exam_score_override: z.record(z.string().uuid(), z.number().min(0).max(100)).nullable().optional(),
});

const blastEmailSchema = z.object({
    exam_submission_id: z.string().uuid(),
});

export class CertificationScoreController {
    constructor(
        private manageCertificationScores: ManageCertificationScores,
        private manageCertificate: ManageCertificate
    ) { }

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const examSubmissionId = typeof req.query.exam_submission_id === 'string'
                ? req.query.exam_submission_id
                : undefined;
            const scores = await this.manageCertificationScores.getAll(examSubmissionId);
            res.status(200).json(scores);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateSchema.parse(req.body);
            const score = await this.manageCertificationScores.update(req.params.id, {
                additionalScore: data.additional_score,
                examScoreOverride: data.exam_score_override,
            });
            res.status(200).json({ message: 'Certification score updated', score });
        } catch (error: any) {
            if (error.message === 'Certification score not found') {
                return res.status(404).json({ message: error.message });
            }
            if (error.message?.startsWith('Unknown additional score name')) {
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
            const { exam_submission_id } = blastEmailSchema.parse(req.body);
            const { to, fullName, downloadUrl } = await this.manageCertificate.emailBySubmission(exam_submission_id, env.BASE_URL);
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