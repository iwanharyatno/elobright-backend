import { IStudentRepository } from '../../domain/repositories/IStudentRepository';
import { Student } from '../../domain/entities/Student';
import { db } from '../../infrastructure/database/db';
import { studentsTable } from '../../infrastructure/database/schema';
import { eq, sql } from 'drizzle-orm';

export class DrizzleStudentRepository implements IStudentRepository {
    async create(data: Omit<Student, 'id'>): Promise<Student> {
        const [student] = await db.insert(studentsTable).values(data).returning();
        return student as Student;
    }

    async findByUserId(userId: number): Promise<Student | null> {
        const [student] = await db.select().from(studentsTable).where(eq(studentsTable.userId, userId));
        return (student as Student) || null;
    }

    async findByStudentId(studentId: string): Promise<Student | null> {
        const normalized = studentId.trim();
        const [student] = await db.select().from(studentsTable).where(sql`lower(${studentsTable.studentId}) = lower(${normalized})`);
        return (student as Student) || null;
    }

    async findAll(): Promise<Student[]> {
        const results = await db.select().from(studentsTable);
        return results as Student[];
    }

    async updateDegreeProgram(userId: number, degreeProgram: string): Promise<Student | null> {
        const [updated] = await db.update(studentsTable)
            .set({ degreeProgram })
            .where(eq(studentsTable.userId, userId))
            .returning();
        return (updated as Student) || null;
    }
}
