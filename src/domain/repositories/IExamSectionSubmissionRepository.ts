import { ExamSectionSubmission } from '../entities/ExamSectionSubmission';

export interface IExamSectionSubmissionRepository {
    create(data: Omit<ExamSectionSubmission, 'id'>): Promise<ExamSectionSubmission>;
    update(id: string, data: Partial<Omit<ExamSectionSubmission, 'id'>>): Promise<ExamSectionSubmission | null>;
    findById(id: string): Promise<ExamSectionSubmission | null>;
    findBySubmissionId(submissionId: string): Promise<ExamSectionSubmission[]>;
    findBySubmissionAndSection(submissionId: string, examSectionId: string): Promise<ExamSectionSubmission[]>;
    findLatestBySubmissionId(submissionId: string): Promise<ExamSectionSubmission | null>;
    incrementTotalScore(id: string, amount: number): Promise<ExamSectionSubmission | null>;
}
