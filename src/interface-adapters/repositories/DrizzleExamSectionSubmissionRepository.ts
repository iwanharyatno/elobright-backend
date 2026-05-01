import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { ExamSectionSubmission } from '../../domain/entities/ExamSectionSubmission';
import { db } from '../../infrastructure/database/db';
import { examSectionSubmissionsTable } from '../../infrastructure/database/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export class DrizzleExamSectionSubmissionRepository implements IExamSectionSubmissionRepository {
    async create(data: Omit<ExamSectionSubmission, 'id'>): Promise<ExamSectionSubmission> {
        const [submission] = await db.insert(examSectionSubmissionsTable).values(data).returning();
        return submission as ExamSectionSubmission;
    }

    async update(id: string, data: Partial<Omit<ExamSectionSubmission, 'id'>>): Promise<ExamSectionSubmission | null> {
        const [updatedSubmission] = await db.update(examSectionSubmissionsTable)
            .set(data)
            .where(eq(examSectionSubmissionsTable.id, id))
            .returning();
        return (updatedSubmission as ExamSectionSubmission) || null;
    }

    async findById(id: string): Promise<ExamSectionSubmission | null> {
        const [submission] = await db.select().from(examSectionSubmissionsTable).where(eq(examSectionSubmissionsTable.id, id));
        return (submission as ExamSectionSubmission) || null;
    }

    async findBySubmissionId(submissionId: string): Promise<ExamSectionSubmission[]> {
        const submissions = await db.select().from(examSectionSubmissionsTable)
            .where(eq(examSectionSubmissionsTable.submissionId, submissionId));
        return submissions as ExamSectionSubmission[];
    }

    async findBySubmissionAndSection(submissionId: string, examSectionId: string): Promise<ExamSectionSubmission[]> {
        const submissions = await db.select().from(examSectionSubmissionsTable)
            .where(and(eq(examSectionSubmissionsTable.submissionId, submissionId), eq(examSectionSubmissionsTable.examSectionId, examSectionId)));
        return submissions as ExamSectionSubmission[];
    }

    async findLatestBySubmissionId(submissionId: string): Promise<ExamSectionSubmission | null> {
        const [submission] = await db.select().from(examSectionSubmissionsTable)
            .where(eq(examSectionSubmissionsTable.submissionId, submissionId))
            .orderBy(desc(examSectionSubmissionsTable.startedAt))
            .limit(1);
        return (submission as ExamSectionSubmission) || null;
    }

    async incrementTotalScore(id: string, amount: number): Promise<ExamSectionSubmission | null> {
        const [updatedSubmission] = await db.update(examSectionSubmissionsTable)
            .set({
                totalScore: sql`${examSectionSubmissionsTable.totalScore} + ${amount}`
            })
            .where(eq(examSectionSubmissionsTable.id, id))
            .returning();

        return (updatedSubmission as ExamSectionSubmission) || null;
    }
}
