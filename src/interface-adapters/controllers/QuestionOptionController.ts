import { Request, Response, NextFunction } from 'express';
import { ManageQuestionOptions } from '../../use-cases/exam/ManageQuestionOptions';
import { z } from 'zod';

const createQuestionOptionSchema = z.object({
    questionId: z.string().uuid(),
    optionText: z.string().optional().nullable(),
    isCorrect: z.boolean().optional().nullable(),
});

const updateQuestionOptionSchema = createQuestionOptionSchema.partial();

export class QuestionOptionController {
    constructor(private manageQuestionOptions: ManageQuestionOptions) { }

    create = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = createQuestionOptionSchema.parse(req.body);
            const option = await this.manageQuestionOptions.create(data as any);
            res.status(201).json({ message: 'Question Option created', option });
        } catch (error) {
            next(error);
        }
    };

    getById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const option = await this.manageQuestionOptions.getById(req.params.id);
            if (!option) {
                return res.status(404).json({ message: 'Question Option not found' });
            }
            res.status(200).json(option);
        } catch (error) {
            next(error);
        }
    };

    getByQuestionId = async (req: Request<{ questionId: string }>, res: Response, next: NextFunction) => {
        try {
            const options = await this.manageQuestionOptions.getByQuestionId(req.params.questionId);
            res.status(200).json(options);
        } catch (error) {
            next(error);
        }
    };

    getByQuestionIdForUser = async (req: Request<{ questionId: string }>, res: Response, next: NextFunction) => {
        try {
            const options = await this.manageQuestionOptions.getByQuestionId(req.params.questionId);
            const sanitizedOptions = options.map(opt => {
                const { isCorrect, ...rest } = opt;
                return rest;
            });
            res.status(200).json(sanitizedOptions);
        } catch (error) {
            next(error);
        }
    };

    update = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = updateQuestionOptionSchema.parse(req.body);
            const option = await this.manageQuestionOptions.update(req.params.id, data as any);
            if (!option) {
                return res.status(404).json({ message: 'Question Option not found' });
            }
            res.status(200).json({ message: 'Question Option updated', option });
        } catch (error) {
            next(error);
        }
    };

    delete = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const success = await this.manageQuestionOptions.delete(req.params.id);
            if (!success) {
                return res.status(404).json({ message: 'Question Option not found' });
            }
            res.status(200).json({ message: 'Question Option deleted' });
        } catch (error) {
            next(error);
        }
    };
}
