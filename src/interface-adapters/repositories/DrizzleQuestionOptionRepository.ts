import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';
import { QuestionOption } from '../../domain/entities/QuestionOption';
import { db } from '../../infrastructure/database/db';
import { questionOptionsTable } from '../../infrastructure/database/schema';
import { eq } from 'drizzle-orm';

export class DrizzleQuestionOptionRepository implements IQuestionOptionRepository {
    async create(data: Omit<QuestionOption, 'id'>): Promise<QuestionOption> {
        const [option] = await db.insert(questionOptionsTable).values(data).returning();
        return option as QuestionOption;
    }

    async findById(id: string): Promise<QuestionOption | null> {
        const [option] = await db.select().from(questionOptionsTable).where(eq(questionOptionsTable.id, id));
        return (option as QuestionOption) || null;
    }

    async findByQuestionId(questionId: string): Promise<QuestionOption[]> {
        const options = await db.select()
            .from(questionOptionsTable)
            .where(eq(questionOptionsTable.questionId, questionId));
        return options as QuestionOption[];
    }

    async update(id: string, data: Partial<Omit<QuestionOption, 'id'>>): Promise<QuestionOption | null> {
        const [updatedOption] = await db.update(questionOptionsTable)
            .set(data)
            .where(eq(questionOptionsTable.id, id))
            .returning();
        return (updatedOption as QuestionOption) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.delete(questionOptionsTable).where(eq(questionOptionsTable.id, id)).returning();
        return result.length > 0;
    }
}
