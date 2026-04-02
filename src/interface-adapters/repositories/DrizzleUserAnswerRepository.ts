import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { UserAnswer } from '../../domain/entities/UserAnswer';
import { db } from '../../infrastructure/database/db';
import { userAnswersTable } from '../../infrastructure/database/schema';

import { eq, and } from 'drizzle-orm';

export class DrizzleUserAnswerRepository implements IUserAnswerRepository {
    async create(data: Omit<UserAnswer, 'id'>): Promise<UserAnswer> {
        const [answer] = await db.insert(userAnswersTable).values(data).returning();
        return answer as UserAnswer;
    }

    async update(id: string, data: Partial<Omit<UserAnswer, 'id'>>): Promise<UserAnswer> {
        const [updatedAnswer] = await db.update(userAnswersTable)
            .set(data)
            .where(eq(userAnswersTable.id, id))
            .returning();
        return updatedAnswer as UserAnswer;
    }

    async findBySubmissionAndQuestion(submissionId: string, questionId: string): Promise<UserAnswer | null> {
        const [answer] = await db.select().from(userAnswersTable)
            .where(and(eq(userAnswersTable.submissionId, submissionId), eq(userAnswersTable.questionId, questionId)));
        return (answer as UserAnswer) || null;
    }
}
