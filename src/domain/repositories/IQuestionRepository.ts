import { Question } from '../entities/Question';

export interface IQuestionRepository {
    create(data: Omit<Question, 'id'>): Promise<Question>;
    findById(id: string): Promise<Question | null>;
    findBySectionId(sectionId: string): Promise<Question[]>;
    update(id: string, data: Partial<Omit<Question, 'id'>>): Promise<Question | null>;
    delete(id: string): Promise<boolean>;
}
