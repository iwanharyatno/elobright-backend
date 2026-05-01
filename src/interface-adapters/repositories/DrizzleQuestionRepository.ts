import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { Question } from '../../domain/entities/Question';
import { db } from '../../infrastructure/database/db';
import { questionsTable } from '../../infrastructure/database/schema';
import { eq, max, and, inArray } from 'drizzle-orm';

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
            .where(
                and(
                    eq(questionsTable.sectionId, sectionId),
                    eq(questionsTable.isActive, true)
                )
            )
            .orderBy(questionsTable.orderIndex);
        return questions as Question[];
    }

    async findByIds(ids: string[]): Promise<Question[]> {
        if (ids.length === 0) return [];
        const questions = await db.select()
            .from(questionsTable)
            .where(inArray(questionsTable.id, ids));
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

    async reorder(id: string, direction: 'up' | 'down'): Promise<boolean> {
        const question = await this.findById(id);
        if (!question || question.orderIndex === null) return false;

        const allQuestions = await this.findBySectionId(question.sectionId);
        const currentIndex = allQuestions.findIndex(q => q.id === id);

        if (currentIndex === -1) return false;

        let targetQuestion: Question | undefined;

        if (direction === 'up' && currentIndex > 0) {
            targetQuestion = allQuestions[currentIndex - 1];
        } else if (direction === 'down' && currentIndex < allQuestions.length - 1) {
            targetQuestion = allQuestions[currentIndex + 1];
        }

        if (!targetQuestion || targetQuestion.orderIndex === null) return false;

        // Swap orderIndex values
        await db.transaction(async (tx) => {
            await tx.update(questionsTable)
                .set({ orderIndex: targetQuestion!.orderIndex })
                .where(eq(questionsTable.id, question.id));

            await tx.update(questionsTable)
                .set({ orderIndex: question.orderIndex })
                .where(eq(questionsTable.id, targetQuestion!.id));
        });

        return true;
    }

    async getMaxOrderIndex(sectionId: string): Promise<number> {
        const [result] = await db.select({ maxValue: max(questionsTable.orderIndex) })
            .from(questionsTable)
            .where(eq(questionsTable.sectionId, sectionId));
        return result?.maxValue ?? 0;
    }
}
