import { IStudentRepository } from '../../domain/repositories/IStudentRepository';
import { Student } from '../../domain/entities/Student';
import { db } from '../../infrastructure/database/db';
import { studentsTable } from '../../infrastructure/database/schema';

export class DrizzleStudentRepository implements IStudentRepository {
    async create(data: Omit<Student, 'id'>): Promise<Student> {
        const [student] = await db.insert(studentsTable).values(data).returning();
        return student as Student;
    }
}
