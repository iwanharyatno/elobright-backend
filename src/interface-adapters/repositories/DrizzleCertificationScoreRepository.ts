import { eq } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { certificationScoresTable } from '../../infrastructure/database/schema';
import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { CertificationScore } from '../../domain/entities/CertificationScore';

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

    async findAll(): Promise<CertificationScore[]> {
        const scores = await db.select().from(certificationScoresTable);
        return scores as CertificationScore[];
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