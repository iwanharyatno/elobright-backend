import { eq, ilike, or, and } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { certificationScoresTable, usersTable, studentsTable, examSubmissionsTable } from '../../infrastructure/database/schema';
import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { CertificationScore, CertificationScoreWithUser } from '../../domain/entities/CertificationScore';
const toPublicUser = (user: typeof usersTable.$inferSelect) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phoneNumber: user.phoneNumber,
});

export class DrizzleCertificationScoreRepository implements ICertificationScoreRepository {
    async createForSubmission(userId: number, examSubmissionId: string): Promise<CertificationScore | null> {
        const [score] = await db
            .insert(certificationScoresTable)
            .values({ userId, examSubmissionId, additionalScore: null })
            .onConflictDoNothing({ target: certificationScoresTable.examSubmissionId })
            .returning();
        return (score as CertificationScore) || null;
    }

    async findById(id: string): Promise<CertificationScore | null> {
        const [score] = await db
            .select()
            .from(certificationScoresTable)
            .where(eq(certificationScoresTable.id, id));
        return (score as CertificationScore) || null;
    }

    async findByExamSubmissionId(examSubmissionId: string): Promise<CertificationScoreWithUser | null> {
        const [row] = await db
            .select({ score: certificationScoresTable, user: usersTable })
            .from(certificationScoresTable)
            .leftJoin(usersTable, eq(certificationScoresTable.userId, usersTable.id))
            .where(eq(certificationScoresTable.examSubmissionId, examSubmissionId));
        if (!row) return null;
        return {
            ...(row.score as CertificationScore),
            user: row.user ? toPublicUser(row.user) : undefined,
        };
    }

    async findAll(): Promise<CertificationScoreWithUser[]> {
        const rows = await db
            .select({ score: certificationScoresTable, user: usersTable })
            .from(certificationScoresTable)
            .leftJoin(usersTable, eq(certificationScoresTable.userId, usersTable.id));
        return rows.map(({ score, user }) => ({
            ...(score as CertificationScore),
            user: user ? toPublicUser(user) : undefined,
        }));
    }

    async findFiltered(filters: { examId?: string; search?: string }): Promise<CertificationScoreWithUser[]> {
        const conditions: any[] = [];
        // Search filter: case-insensitive ilike on users.fullName, users.email, students.studentId
        if (filters.search && filters.search.trim() !== '') {
            const pattern = `%${filters.search.trim()}%`;
            conditions.push(
                or(
                    ilike(usersTable.fullName, pattern),
                    ilike(usersTable.email, pattern),
                    ilike(studentsTable.studentId, pattern)
                )
            );
        }

        // ExamId filter via exam_submissions
        if (filters.examId) {
            conditions.push(eq(examSubmissionsTable.examId, filters.examId));
        }

        if (conditions.length > 0) {
            const rows = await db
                .select({ score: certificationScoresTable, user: usersTable })
                .from(certificationScoresTable)
                .leftJoin(usersTable, eq(certificationScoresTable.userId, usersTable.id))
                .leftJoin(studentsTable, eq(studentsTable.userId, certificationScoresTable.userId))
                .leftJoin(examSubmissionsTable, eq(examSubmissionsTable.id, certificationScoresTable.examSubmissionId))
                .where(conditions.length === 1 ? conditions[0] : and(...conditions));
            return rows.map(({ score, user }) => ({
                ...(score as CertificationScore),
                user: user ? toPublicUser(user) : undefined,
            }));
        }

        return this.findAll();
    }

    async updateAdditionalScore(id: string, additionalScore: Record<string, number>): Promise<CertificationScore | null> {
        const [updated] = await db
            .update(certificationScoresTable)
            .set({ additionalScore })
            .where(eq(certificationScoresTable.id, id))
            .returning();
        return (updated as CertificationScore) || null;
    }

    async updateExamScoreOverride(id: string, examScoreOverride: Record<string, number> | null): Promise<CertificationScore | null> {
        const [updated] = await db
            .update(certificationScoresTable)
            .set({ examScoreOverride })
            .where(eq(certificationScoresTable.id, id))
            .returning();
        return (updated as CertificationScore) || null;
    }
}