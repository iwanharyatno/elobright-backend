import { Exam } from '../entities/Exam';

export interface IExamRepository {
    create(data: Omit<Exam, 'id'>): Promise<Exam>;
    findById(id: string): Promise<Exam | null>;
    findAll(): Promise<Exam[]>;
    update(id: string, data: Partial<Omit<Exam, 'id'>>): Promise<Exam | null>;
    delete(id: string): Promise<boolean>;
}
