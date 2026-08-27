import { Student } from '../entities/Student';

export interface IStudentRepository {
    create(data: Omit<Student, 'id'>): Promise<Student>;
    findByUserId(userId: number): Promise<Student | null>;
    findAll(): Promise<Student[]>;
    updateDegreeProgram(userId: number, degreeProgram: string): Promise<Student | null>;
}
