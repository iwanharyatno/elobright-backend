import { UserAnswer } from '../entities/UserAnswer';

export interface IUserAnswerRepository {
    create(data: Omit<UserAnswer, 'id'>): Promise<UserAnswer>;
}
