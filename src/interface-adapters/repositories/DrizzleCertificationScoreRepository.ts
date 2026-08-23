import { eq } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { certificationScoresTable, usersTable } from '../../infrastructure/database/schema';
import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { CertificationScore, CertificationScoreWithUser } from '../../domain/entities/CertificationScore';

const toPublicUser = (user: typeof usersTable.$inferSelect) => {
    const { passwordHash: _passwordHash, verificationCode: _verificationCode, ...publicUser } = user;
    return publicUser;
};

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

    async findByExamSubmissionId(examSubmissionId: string): Promise<CertificationScore | null> {
        const [score] = await db
            .select()
            .from(certificationScoresTable)
            .where(eq(certificationScoresTable.examSubmissionId, examSubmissionId));
        return (score as CertificationScore) || null;
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

    async updateAdditionalScore(id: string, additionalScore: Record<string, number>): Promise<CertificationScore | null> {
        const [updated] = await db
            .update(certificationScoresTable)
            .set({ additionalScore })
            .where(eq(certificationScoresTable.id, id))
            .returning();
        return (updated as CertificationScore) || null;
    }

    async updateExamScoreOverride(id: string, examScoreOverride: number | null): Promise<CertificationScore | null> {
        const [updated] = await db
            .update(certificationScoresTable)
            .set({ examScoreOverride })
            .where(eq(certificationScoresTable.id, id))
            .returning();
        return (updated as CertificationScore) || null;
    }
}