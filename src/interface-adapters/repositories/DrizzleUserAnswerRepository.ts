import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { UserAnswer } from '../../domain/entities/UserAnswer';
import { db } from '../../infrastructure/database/db';
import { userAnswersTable } from '../../infrastructure/database/schema';

export class DrizzleUserAnswerRepository implements IUserAnswerRepository {
    async create(data: Omit<UserAnswer, 'id'>): Promise<UserAnswer> {
        const [answer] = await db.insert(userAnswersTable).values(data).returning();
        return answer as UserAnswer;
    }
}
