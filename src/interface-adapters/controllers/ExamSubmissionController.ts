import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ManageExamSessions } from '../../use-cases/exam/ManageExamSessions';
import { RecordUserAnswer } from '../../use-cases/exam/RecordUserAnswer';

const startSchema = z.object({
    userId: z.number().int().positive(),
    examId: z.string().uuid(),
});

const answerSchema = z.object({
    questionId: z.string().uuid(),
    selectedOptionId: z.string().uuid().optional(),
    textResponse: z.string().optional(),
});

export class ExamSubmissionController {
    constructor(
        private manageExamSessions: ManageExamSessions,
        private recordUserAnswer: RecordUserAnswer
    ) { }

    start = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = startSchema.parse(req.body);
            const session = await this.manageExamSessions.startExam(data.userId, data.examId);
            res.status(201).json({ message: 'Exam started', session });
        } catch (error) {
            next(error);
        }
    };

    finish = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const session = await this.manageExamSessions.finishExam(req.params.id);
            if (!session) {
                return res.status(404).json({ message: 'Exam session not found' });
            }
            res.status(200).json({ message: 'Exam finished', session });
        } catch (error) {
            next(error);
        }
    };

    recordAnswer = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = answerSchema.parse(req.body);
            const file = req.file as Express.Multer.File | undefined;
            const answer = await this.recordUserAnswer.execute(
                req.params.id,
                data.questionId,
                data.selectedOptionId,
                data.textResponse,
                file
            );

            res.status(201).json({ message: 'Answer recorded', answer });
        } catch (error: any) {
            if (error.message === 'Time window exceeded' || error.message === 'Exam is not currently ongoing') {
                return res.status(400).json({ message: error.message });
            }
            if (error.message === 'Submission not found') {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    };
}
