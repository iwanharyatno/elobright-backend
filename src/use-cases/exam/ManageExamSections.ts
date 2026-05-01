import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { ExamSection } from '../../domain/entities/ExamSection';

export class ManageExamSections {
    constructor(private sectionRepository: IExamSectionRepository) { }

    async create(data: Omit<ExamSection, 'id'>): Promise<ExamSection> {
        if (data.orderIndex === undefined || data.orderIndex === null) {
            const maxOrder = await this.sectionRepository.getMaxOrderIndex(data.examId);
            data.orderIndex = maxOrder + 1;
        }
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
