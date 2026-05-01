import { Student } from '../entities/Student';

export interface IStudentRepository {
    create(data: Omit<Student, 'id'>): Promise<Student>;
}
