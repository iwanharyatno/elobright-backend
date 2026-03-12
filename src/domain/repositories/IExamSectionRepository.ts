import { ExamSection } from '../entities/ExamSection';

export interface IExamSectionRepository {
    create(data: Omit<ExamSection, 'id'>): Promise<ExamSection>;
    findById(id: string): Promise<ExamSection | null>;
    findByExamId(examId: string): Promise<ExamSection[]>;
    update(id: string, data: Partial<Omit<ExamSection, 'id'>>): Promise<ExamSection | null>;
    delete(id: string): Promise<boolean>;
    reorder(id: string, direction: 'up' | 'down'): Promise<boolean>;
}
