import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { ExamSubmission } from '../../domain/entities/ExamSubmission';

export class ManageExamSessions {
    constructor(private submissionRepository: IExamSubmissionRepository) { }

    async startExam(userId: number, examId: string): Promise<ExamSubmission> {
        return this.submissionRepository.create({
            userId,
            examId,
            status: 'ongoing',
            totalScore: 0,
            startedAt: new Date(),
            submittedAt: null
        });
    }

    async finishExam(submissionId: string): Promise<ExamSubmission | null> {
        return this.submissionRepository.update(submissionId, {
            status: 'submitted',
            submittedAt: new Date()
        });
    }
}
