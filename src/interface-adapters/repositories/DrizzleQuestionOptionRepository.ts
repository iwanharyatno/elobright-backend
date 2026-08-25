import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';
import { QuestionOption } from '../../domain/entities/QuestionOption';
import { db } from '../../infrastructure/database/db';
import { questionOptionsTable } from '../../infrastructure/database/schema';
import { eq, inArray, and, isNull } from 'drizzle-orm';

export class DrizzleQuestionOptionRepository implements IQuestionOptionRepository {
    async create(data: Omit<QuestionOption, 'id'>): Promise<QuestionOption> {
        const [option] = await db.insert(questionOptionsTable).values(data).returning();
        return option as QuestionOption;
    }

    async findById(id: string): Promise<QuestionOption | null> {
        const [option] = await db.select().from(questionOptionsTable)
            .where(and(eq(questionOptionsTable.id, id), isNull(questionOptionsTable.deletedAt)));
        return (option as QuestionOption) || null;
    }

    async findByQuestionId(questionId: string): Promise<QuestionOption[]> {
        const options = await db.select()
            .from(questionOptionsTable)
            .where(and(eq(questionOptionsTable.questionId, questionId), isNull(questionOptionsTable.deletedAt)));
        return options as QuestionOption[];
    }

    async findByQuestionIds(questionIds: string[]): Promise<QuestionOption[]> {
        if (questionIds.length === 0) return [];
        const options = await db.select()
            .from(questionOptionsTable)
            .where(and(inArray(questionOptionsTable.questionId, questionIds), isNull(questionOptionsTable.deletedAt)));
        return options as QuestionOption[];
    }

    async findByIds(ids: string[]): Promise<QuestionOption[]> {
        if (ids.length === 0) return [];
        const options = await db.select()
            .from(questionOptionsTable)
            .where(and(inArray(questionOptionsTable.id, ids), isNull(questionOptionsTable.deletedAt)));
        return options as QuestionOption[];
    }

    async update(id: string, data: Partial<Omit<QuestionOption, 'id'>>): Promise<QuestionOption | null> {
        const [updatedOption] = await db.update(questionOptionsTable)
            .set(data)
            .where(and(eq(questionOptionsTable.id, id), isNull(questionOptionsTable.deletedAt)))
            .returning();
        return (updatedOption as QuestionOption) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.update(questionOptionsTable)
            .set({ deletedAt: new Date() })
            .where(and(eq(questionOptionsTable.id, id), isNull(questionOptionsTable.deletedAt)))
            .returning();
        return result.length > 0;
    }
}