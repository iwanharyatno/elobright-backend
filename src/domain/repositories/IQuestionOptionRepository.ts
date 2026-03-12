import { QuestionOption } from '../entities/QuestionOption';

export interface IQuestionOptionRepository {
    create(data: Omit<QuestionOption, 'id'>): Promise<QuestionOption>;
    findById(id: string): Promise<QuestionOption | null>;
    findByQuestionId(questionId: string): Promise<QuestionOption[]>;
    update(id: string, data: Partial<Omit<QuestionOption, 'id'>>): Promise<QuestionOption | null>;
    delete(id: string): Promise<boolean>;
}
