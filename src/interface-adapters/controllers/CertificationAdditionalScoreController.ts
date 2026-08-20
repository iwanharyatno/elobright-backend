import { Request, Response, NextFunction } from 'express';
import { ManageCertificationAdditionalScores } from '../../use-cases/certification/ManageCertificationAdditionalScores';
import { z } from 'zod';

const createSchema = z.object({
    scoreName: z.string().min(1).max(255),
    weight: z.number().min(0).max(1),
});

const updateSchema = createSchema.partial();

export class CertificationAdditionalScoreController {
    constructor(private manageCertificationAdditionalScores: ManageCertificationAdditionalScores) { }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createSchema.parse(req.body);
            const score = await this.manageCertificationAdditionalScores.create(data as any);
            res.status(201).json({ message: 'Certification additional score created', score });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const score = await this.manageCertificationAdditionalScores.getById(req.params.id);
            if (!score) {
                return res.status(404).json({ message: 'Certification additional score not found' });
            }
            res.status(200).json(score);
        } catch (error) {
            next(error);
        }
    };

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const scores = await this.manageCertificationAdditionalScores.getAll();
            res.status(200).json(scores);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateSchema.parse(req.body);
            const score = await this.manageCertificationAdditionalScores.update(req.params.id, data as any);
            if (!score) {
                return res.status(404).json({ message: 'Certification additional score not found' });
            }
            res.status(200).json({ message: 'Certification additional score updated', score });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const success = await this.manageCertificationAdditionalScores.delete(req.params.id);
            if (!success) {
                return res.status(404).json({ message: 'Certification additional score not found' });
            }
            res.status(200).json({ message: 'Certification additional score deleted' });
        } catch (error) {
            next(error);
        }
    };
}