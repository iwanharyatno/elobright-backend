import { UserAnswer } from '../entities/UserAnswer';

export interface IUserAnswerRepository {
    create(data: Omit<UserAnswer, 'id'>): Promise<UserAnswer>;
    update(id: string, data: Partial<Omit<UserAnswer, 'id'>>): Promise<UserAnswer>;
    findBySectionSubmissionAndQuestion(sectionSubmissionId: string, questionId: string): Promise<UserAnswer | null>;
    findBySectionSubmissionId(sectionSubmissionId: string): Promise<UserAnswer[]>;
    findBySectionSubmissionIds(sectionSubmissionIds: string[]): Promise<UserAnswer[]>;
}
