import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { ExamSubmission } from '../../domain/entities/ExamSubmission';

export class ManageExamSessions {
    constructor(
        private submissionRepository: IExamSubmissionRepository,
        private examRepository: IExamRepository
    ) { }

    async startExam(userId: number, examId: string, timezone?: string): Promise<ExamSubmission> {
        const exam = await this.examRepository.findById(examId);
        if (!exam) {
            throw new Error('Exam not found');
        }

        const existingSubmissions = await this.submissionRepository.findByUserAndExam(userId, examId);
        const hasOngoing = existingSubmissions.some(s => s.status === 'ongoing');
        if (hasOngoing) {
            throw new Error('Ongoing session already exists');
        }

        const startedAt = new Date();
        let endTimeLimit: Date | null = null;
        if (exam.durationMinutes) {
            endTimeLimit = new Date(startedAt.getTime() + exam.durationMinutes * 60000);
        }

        return this.submissionRepository.create({
            userId,
            examId,
            status: 'ongoing',
            totalScore: 0,
            timezone: timezone || null,
            startedAt,
            endTimeLimit,
            submittedAt: null
        });
    }

    async finishExam(submissionId: string, timezone?: string): Promise<ExamSubmission | null> {
        const submission = await this.submissionRepository.findById(submissionId);
        if (!submission) return null;

        const now = new Date();
        if (submission.endTimeLimit && now > submission.endTimeLimit) {
            throw new Error('Time window exceeded');
        }

        return this.submissionRepository.update(submissionId, {
            status: 'submitted',
            ...(timezone && { timezone }),
            submittedAt: now
        });
    }
}
