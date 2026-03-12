import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { Exam } from '../../domain/entities/Exam';
import { db } from '../../infrastructure/database/db';
import { examsTable } from '../../infrastructure/database/schema';
import { eq } from 'drizzle-orm';

export class DrizzleExamRepository implements IExamRepository {
    async create(data: Omit<Exam, 'id'>): Promise<Exam> {
        const [exam] = await db.insert(examsTable).values(data).returning();
        return exam as Exam;
    }

    async findById(id: string): Promise<Exam | null> {
        const [exam] = await db.select().from(examsTable).where(eq(examsTable.id, id));
        return (exam as Exam) || null;
    }

    async findAll(): Promise<Exam[]> {
        const exams = await db.select().from(examsTable);
        return exams as Exam[];
    }

    async update(id: string, data: Partial<Omit<Exam, 'id'>>): Promise<Exam | null> {
        const [updatedExam] = await db.update(examsTable)
            .set(data)
            .where(eq(examsTable.id, id))
            .returning();
        return (updatedExam as Exam) || null;
    }

    async delete(id: string): Promise<boolean> {
        const result = await db.delete(examsTable).where(eq(examsTable.id, id)).returning();
        return result.length > 0;
    }
}
