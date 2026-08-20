import { eq } from 'drizzle-orm';
import { db } from '../../infrastructure/database/db';
import { certificationAdditionalScoresTable } from '../../infrastructure/database/schema';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { CertificationAdditionalScore } from '../../domain/entities/CertificationAdditionalScore';

export class DrizzleCertificationAdditionalScoreRepository implements ICertificationAdditionalScoreRepository {
    async create(data: Omit<CertificationAdditionalScore, 'id'>): Promise<CertificationAdditionalScore> {
        const [score] = await db.insert(certificationAdditionalScoresTable).values(data).returning();
        return score as CertificationAdditionalScore;
    }

    async findById(id: string): Promise<CertificationAdditionalScore | null> {
        const [score] = await db
            .select()
            .from(certificationAdditionalScoresTable)
            .where(eq(certificationAdditionalScoresTable.id, id));
        return (score as CertificationAdditionalScore) || null;
    }

    async findAll(): Promise<CertificationAdditionalScore[]> {
        const scores = await db.select().from(certificationAdditionalScoresTable);
        return scores as CertificationAdditionalScore[];
    }

    async update(id: string, data: Partial<Omit<CertificationAdditionalScore, 'id'>>): Promise<CertificationAdditionalScore | null> {
        const [updated] = await db
            .update(certificationAdditionalScoresTable)
            .set(data)
            .where(eq(certificationAdditionalScoresTable.id, id))
            .returning();
        return (updated as CertificationAdditionalScore) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db
            .delete(certificationAdditionalScoresTable)
            .where(eq(certificationAdditionalScoresTable.id, id))
            .returning();
        return result.length > 0;
    }
}