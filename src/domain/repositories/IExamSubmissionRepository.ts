import { ExamSubmission } from '../entities/ExamSubmission';

export interface IExamSubmissionRepository {
    create(data: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission>;
    update(id: string, data: Partial<Omit<ExamSubmission, 'id'>>): Promise<ExamSubmission | null>;
    findById(id: string): Promise<ExamSubmission | null>;
    findByUserAndExam(userId: number, examId: string): Promise<ExamSubmission[]>;
    incrementTotalScore(id: string, amount: number): Promise<ExamSubmission | null>;
}
