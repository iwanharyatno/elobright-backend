import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { Question } from '../../domain/entities/Question';

export class ManageQuestions {
    constructor(private questionRepository: IQuestionRepository) { }

    async create(data: Omit<Question, 'id'>, audioFile?: Express.Multer.File, imageFile?: Express.Multer.File): Promise<Question> {
        if (audioFile) {
            data.audioUrl = `/uploads/${audioFile.filename}`;
        }
        if (imageFile) {
            data.imageUrl = `/uploads/${imageFile.filename}`;
        }
        return this.questionRepository.create(data);
    }

    async getById(id: string): Promise<Question | null> {
        return this.questionRepository.findById(id);
    }

    async getBySectionId(sectionId: string): Promise<Question[]> {
        return this.questionRepository.findBySectionId(sectionId);
    }

    async update(id: string, data: Partial<Omit<Question, 'id'>>, audioFile?: Express.Multer.File, imageFile?: Express.Multer.File): Promise<Question | null> {
        if (audioFile) {
            data.audioUrl = `/uploads/${audioFile.filename}`;
        }
        if (imageFile) {
            data.imageUrl = `/uploads/${imageFile.filename}`;
        }
        return this.questionRepository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return this.questionRepository.delete(id);
    }
}
