import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { Question } from '../../domain/entities/Question';
import { db } from '../../infrastructure/database/db';
import { questionsTable } from '../../infrastructure/database/schema';
import { eq } from 'drizzle-orm';

export class DrizzleQuestionRepository implements IQuestionRepository {
    async create(data: Omit<Question, 'id'>): Promise<Question> {
        const [question] = await db.insert(questionsTable).values(data).returning();
        return question as Question;
    }

    async findById(id: string): Promise<Question | null> {
        const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
        return (question as Question) || null;
    }

    async findBySectionId(sectionId: string): Promise<Question[]> {
        const questions = await db.select()
            .from(questionsTable)
            .where(eq(questionsTable.sectionId, sectionId));
        return questions as Question[];
    }

    async update(id: string, data: Partial<Omit<Question, 'id'>>): Promise<Question | null> {
        const [updatedQuestion] = await db.update(questionsTable)
            .set(data)
            .where(eq(questionsTable.id, id))
            .returning();
        return (updatedQuestion as Question) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.delete(questionsTable).where(eq(questionsTable.id, id)).returning();
        return result.length > 0;
    }
}
