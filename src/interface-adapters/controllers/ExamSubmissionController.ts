import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ManageExamSessions } from '../../use-cases/exam/ManageExamSessions';
import { RecordUserAnswer } from '../../use-cases/exam/RecordUserAnswer';

const startSchema = z.object({
    userId: z.number().int().positive(),
    examId: z.uuid(),
    timezone: z.string().optional()
});

const finishSchema = z.object({
    timezone: z.string().optional()
});

const answerSchema = z.object({
    questionId: z.uuid(),
    selectedOptionId: z.uuid().optional(),
    textResponse: z.string().optional(),
});

function toLocalISOString(date: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        fractionalSecondDigits: 3, hour12: false
    });
    const parts = formatter.formatToParts(date);
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]));

    const hour = p.hour === '24' ? '00' : p.hour;
    const localIso = `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}.${p.fractionalSecond || '000'}`;

    return `${localIso}`;
}

export class ExamSubmissionController {
    constructor(
        private manageExamSessions: ManageExamSessions,
        private recordUserAnswer: RecordUserAnswer
    ) { }

    start = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = startSchema.parse(req.body);
            const session = await this.manageExamSessions.startExam(data.userId, data.examId, data.timezone);

            let endTimeLocale: string | undefined;
            if (session.endTimeLimit && session.timezone) {
                try {
                    endTimeLocale = toLocalISOString(session.endTimeLimit, session.timezone);
                } catch (e) {
                    // Ignore if valid timezone is not available
                }
            }

            res.status(201).json({ message: 'Exam started', session: { ...session, endTimeLocale } });
        } catch (error: any) {
            if (error.message === 'Exam not found') {
                return res.status(404).json({ message: error.message });
            }
            if (error.message === 'Ongoing session already exists') {
                return res.status(400).json({ message: error.message });
            }
            next(error);
        }
    };

    finish = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            // body might be empty or undefined, make a default empty object to parse optional safely
            const data = finishSchema.parse(req.body || {});
            const session = await this.manageExamSessions.finishExam(req.params.id, data.timezone);
            if (!session) {
                return res.status(404).json({ message: 'Exam session not found' });
            }
            res.status(200).json({ message: 'Exam finished', session });
        } catch (error: any) {
            if (error.message === 'Time window exceeded') {
                return res.status(400).json({ message: error.message });
            }
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
