import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';
import { QuestionOption } from '../../domain/entities/QuestionOption';

export class ManageQuestionOptions {
    constructor(private optionRepository: IQuestionOptionRepository) { }

    async create(data: Omit<QuestionOption, 'id'>): Promise<QuestionOption> {
        return this.optionRepository.create(data);
    }

    async getById(id: string): Promise<QuestionOption | null> {
        return this.optionRepository.findById(id);
    }

    async getByQuestionId(questionId: string): Promise<QuestionOption[]> {
        return this.optionRepository.findByQuestionId(questionId);
    }

    async update(id: string, data: Partial<Omit<QuestionOption, 'id'>>): Promise<QuestionOption | null> {
        return this.optionRepository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return this.optionRepository.delete(id);
    }
}
