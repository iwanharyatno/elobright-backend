import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { ExamSubmission } from '../../domain/entities/ExamSubmission';
import { db } from '../../infrastructure/database/db';
import { examSubmissionsTable } from '../../infrastructure/database/schema';
import { eq, and, sql } from 'drizzle-orm';

export class DrizzleExamSubmissionRepository implements IExamSubmissionRepository {
    async create(data: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> {
        const [submission] = await db.insert(examSubmissionsTable).values(data).returning();
        return submission as ExamSubmission;
    }

    async update(id: string, data: Partial<Omit<ExamSubmission, 'id'>>): Promise<ExamSubmission | null> {
        const [updatedSubmission] = await db.update(examSubmissionsTable)
            .set(data)
            .where(eq(examSubmissionsTable.id, id))
            .returning();
        return (updatedSubmission as ExamSubmission) || null;
    }

    async findById(id: string): Promise<ExamSubmission | null> {
        const [submission] = await db.select().from(examSubmissionsTable).where(eq(examSubmissionsTable.id, id));
        return (submission as ExamSubmission) || null;
    }

    async findByUserAndExam(userId: number, examId: string): Promise<ExamSubmission[]> {
        const submissions = await db.select().from(examSubmissionsTable)
            .where(and(eq(examSubmissionsTable.userId, userId), eq(examSubmissionsTable.examId, examId)));
        return submissions as ExamSubmission[];
    }

    async incrementTotalScore(id: string, amount: number): Promise<ExamSubmission | null> {
        const [updatedSubmission] = await db.update(examSubmissionsTable)
            .set({
                totalScore: sql`${examSubmissionsTable.totalScore} + ${amount}`
            })
            .where(eq(examSubmissionsTable.id, id))
            .returning();

        return (updatedSubmission as ExamSubmission) || null;
    }
}
