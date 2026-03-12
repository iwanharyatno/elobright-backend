import { Request, Response, NextFunction } from 'express';
import { ManageExamSections } from '../../use-cases/exam/ManageExamSections';
import { z } from 'zod';

const createExamSectionSchema = z.object({
    examId: z.string().uuid(),
    title: z.string().max(100).optional().nullable(),
    instructions: z.string().optional().nullable(),
    orderIndex: z.number().int().optional().nullable(),
});

const updateExamSectionSchema = createExamSectionSchema.partial();

const reorderSchema = z.object({
    direction: z.enum(['up', 'down']),
});

export class ExamSectionController {
    constructor(private manageExamSections: ManageExamSections) { }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createExamSectionSchema.parse(req.body);
            const section = await this.manageExamSections.create(data as any);
            res.status(201).json({ message: 'Exam Section created', section });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const section = await this.manageExamSections.getById(req.params.id);
            if (!section) {
                return res.status(404).json({ message: 'Exam Section not found' });
            }
            res.status(200).json(section);
        } catch (error) {
            next(error);
        }
    };

    getByExamId = async (req: Request<{ examId: string }>, res: Response, next: NextFunction) => {
        try {
            const sections = await this.manageExamSections.getByExamId(req.params.examId);
            res.status(200).json(sections);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateExamSectionSchema.parse(req.body);
            const section = await this.manageExamSections.update(req.params.id, data as any);
            if (!section) {
                return res.status(404).json({ message: 'Exam Section not found' });
            }
            res.status(200).json({ message: 'Exam Section updated', section });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const success = await this.manageExamSections.delete(req.params.id);
            if (!success) {
                return res.status(404).json({ message: 'Exam Section not found' });
            }
            res.status(200).json({ message: 'Exam Section deleted' });
        } catch (error) {
            next(error);
        }
    };

    reorder = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const { direction } = reorderSchema.parse(req.body);
            const success = await this.manageExamSections.reorder(req.params.id, direction);
            if (!success) {
                return res.status(400).json({ message: 'Failed to reorder section' });
            }
            res.status(200).json({ message: 'Exam Section reordered successfully' });
        } catch (error) {
            next(error);
        }
    };
}
