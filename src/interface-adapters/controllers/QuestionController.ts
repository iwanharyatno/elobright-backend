import { Request, Response, NextFunction } from 'express';
import { ManageQuestions } from '../../use-cases/exam/ManageQuestions';
import { z } from 'zod';

const createQuestionSchema = z.object({
    sectionId: z.string().uuid(),
    narrativeText: z.string().optional().nullable(),
    questionText: z.string().min(1, 'questionText is required'),
    questionType: z.string().max(50).optional().nullable(),
    points: z.preprocess((val) => Number(val), z.number().int().optional().nullable()), // Handles formData numeric strings
});

const updateQuestionSchema = createQuestionSchema.partial();

export class QuestionController {
    constructor(private manageQuestions: ManageQuestions) { }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createQuestionSchema.parse(req.body);
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const audioFile = files?.['audio']?.[0];
            const imageFile = files?.['image']?.[0];

            const question = await this.manageQuestions.create(data as any, audioFile, imageFile);
            res.status(201).json({ message: 'Question created', question });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const question = await this.manageQuestions.getById(req.params.id);
            if (!question) {
                return res.status(404).json({ message: 'Question not found' });
            }
            res.status(200).json(question);
        } catch (error) {
            next(error);
        }
    };

    getBySectionId = async (req: Request<{ sectionId: string }>, res: Response, next: NextFunction) => {
        try {
            const questions = await this.manageQuestions.getBySectionId(req.params.sectionId);
            res.status(200).json(questions);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateQuestionSchema.parse(req.body);
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const audioFile = files?.['audio']?.[0];
            const imageFile = files?.['image']?.[0];

            const question = await this.manageQuestions.update(req.params.id, data as any, audioFile, imageFile);
            if (!question) {
                return res.status(404).json({ message: 'Question not found' });
            }
            res.status(200).json({ message: 'Question updated', question });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const success = await this.manageQuestions.delete(req.params.id);
            if (!success) {
                return res.status(404).json({ message: 'Question not found' });
            }
            res.status(200).json({ message: 'Question deleted' });
        } catch (error) {
            next(error);
        }
    };
}
