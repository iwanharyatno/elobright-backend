import { Request, Response, NextFunction } from 'express';
import { ManageExams } from '../../use-cases/exam/ManageExams';
import { z } from 'zod';

const createExamSchema = z.object({
    title: z.string().max(255).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    durationMinutes: z.number().int().optional().nullable(),
});

const updateExamSchema = createExamSchema.partial();

export class ExamController {
    constructor(private manageExams: ManageExams) { }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createExamSchema.parse(req.body);
            const exam = await this.manageExams.create(data as any);
            res.status(201).json({ message: 'Exam created', exam });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const exam = await this.manageExams.getById(req.params.id);
            if (!exam) {
                return res.status(404).json({ message: 'Exam not found' });
            }
            res.status(200).json(exam);
        } catch (error) {
            next(error);
        }
    };

    getAll = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const exams = await this.manageExams.getAll();
            res.status(200).json(exams);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateExamSchema.parse(req.body);
            const exam = await this.manageExams.update(req.params.id, data);
            if (!exam) {
                return res.status(404).json({ message: 'Exam not found' });
            }
            res.status(200).json({ message: 'Exam updated', exam });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const success = await this.manageExams.delete(req.params.id);
            if (!success) {
                return res.status(404).json({ message: 'Exam not found' });
            }
            res.status(200).json({ message: 'Exam deleted' });
        } catch (error) {
            next(error);
        }
    };
}
