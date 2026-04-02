import { UserAnswer } from '../entities/UserAnswer';

export interface IUserAnswerRepository {
    create(data: Omit<UserAnswer, 'id'>): Promise<UserAnswer>;
    update(id: string, data: Partial<Omit<UserAnswer, 'id'>>): Promise<UserAnswer>;
    findBySubmissionAndQuestion(submissionId: string, questionId: string): Promise<UserAnswer | null>;
}
