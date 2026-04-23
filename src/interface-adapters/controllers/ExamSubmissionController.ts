import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ManageExamSessions } from '../../use-cases/exam/ManageExamSessions';
import { RecordUserAnswer } from '../../use-cases/exam/RecordUserAnswer';
import { AuthRequest } from '../../infrastructure/web/middleware/authMiddleware';

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
            if (session.currentSectionSession.endTimeLimit && session.currentSectionSession.timezone) {
                try {
                    endTimeLocale = toLocalISOString(new Date(session.currentSectionSession.endTimeLimit), session.currentSectionSession.timezone);
                } catch (e) {
                    // Ignore if valid timezone is not available
                }
            }

            res.status(201).json({ message: 'Exam started', session: { ...session, currentSectionSession: { ...session.currentSectionSession, endTimeLocale } } });
        } catch (error: any) {
            if (error.message === 'Exam not found') {
                return res.status(404).json({ message: error.message });
            }
            if (error.message === 'Ongoing session already exists') {
                let endTimeLocale: string | undefined;
                if (error.session && error.session.currentSectionSession.endTimeLimit && error.session.timezone) {
                    try {
                        endTimeLocale = toLocalISOString(new Date(error.session.currentSectionSession.endTimeLimit), error.session.timezone);
                    } catch (e) { }
                }

                return res.status(409).json({
                    message: error.message,
                    session: error.session ? { ...error.session, currentSectionSession: { ...error.session.currentSectionSession, endTimeLocale } } : undefined,
                    checkpoint: error.last_progress || undefined
                });
            }
            next(error);
        }
    };

    finish = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = finishSchema.parse(req.body || {});
            const result = await this.manageExamSessions.finishExam(req.params.id, data.timezone);

            if (!result.submission) {
                return res.status(404).json({ message: 'Exam session not found' });
            }

            res.status(200).json({
                message: 'Exam finished',
                submission: result.submission,
                sectionSubmissions: result.sectionSubmissions
            });
        } catch (error: any) {
            if (error.message === 'Time window exceeded') {
                return res.status(400).json({ message: error.message });
            }
            next(error);
        }
    };

    finishSection = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
        try {
            const data = finishSchema.parse(req.body || {});
            const nextSectionSubmission = await this.manageExamSessions.finishSection(req.params.id, data.timezone);
            let endTimeLocale: string | undefined;
            if (nextSectionSubmission && nextSectionSubmission.endTimeLimit && nextSectionSubmission.timezone) {
                try {
                    endTimeLocale = toLocalISOString(new Date(nextSectionSubmission.endTimeLimit), nextSectionSubmission.timezone);
                } catch (e) {
                    // Ignore if valid timezone is not available
                }
            }

            res.status(200).json({ message: 'Section finished', nextSectionSubmission: { ...nextSectionSubmission, endTimeLocale } });
        } catch (error: any) {
            if (error.message === 'Time window exceeded') {
                return res.status(400).json({ message: error.message });
            }
            if (error.message === 'Exam section session not found') {
                return res.status(404).json({ message: error.message });
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
            if (error.message === 'Time window exceeded' || error.message === 'Section is not currently ongoing') {
                return res.status(400).json({ message: error.message });
            }
            if (error.message === 'Section submission not found') {
                return res.status(404).json({ message: error.message });
            }
            next(error);
        }
    };

    getHistory = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authReq = req as AuthRequest;
            if (!authReq.user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }
            const history = await this.manageExamSessions.getSubmissionHistoryByUserId(authReq.user.userId);
            res.status(200).json(history);
        } catch (error: any) {
            next(error);
        }
    };
}
