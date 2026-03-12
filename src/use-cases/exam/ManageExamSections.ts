import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { ExamSection } from '../../domain/entities/ExamSection';

export class ManageExamSections {
    constructor(private sectionRepository: IExamSectionRepository) { }

    async create(data: Omit<ExamSection, 'id'>): Promise<ExamSection> {
        // If orderIndex is not provided, we could optionally calculate max orderIndex + 1 here.
        // For simplicity, we just pass the data to the repository.
        return this.sectionRepository.create(data);
    }

    async getById(id: string): Promise<ExamSection | null> {
        return this.sectionRepository.findById(id);
    }

    async getByExamId(examId: string): Promise<ExamSection[]> {
        return this.sectionRepository.findByExamId(examId);
    }

    async update(id: string, data: Partial<Omit<ExamSection, 'id'>>): Promise<ExamSection | null> {
        return this.sectionRepository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return this.sectionRepository.delete(id);
    }

    async reorder(id: string, direction: 'up' | 'down'): Promise<boolean> {
        return this.sectionRepository.reorder(id, direction);
    }
}
