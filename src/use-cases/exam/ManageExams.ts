import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { Exam } from '../../domain/entities/Exam';

export class ManageExams {
    constructor(private examRepository: IExamRepository) { }

    async create(data: Omit<Exam, 'id'>): Promise<Exam> {
        return this.examRepository.create(data);
    }

    async getById(id: string): Promise<Exam | null> {
        return this.examRepository.findById(id);
    }

    async getAll(): Promise<Exam[]> {
        return this.examRepository.findAll();
    }

    async update(id: string, data: Partial<Omit<Exam, 'id'>>): Promise<Exam | null> {
        return this.examRepository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return this.examRepository.delete(id);
    }
}
