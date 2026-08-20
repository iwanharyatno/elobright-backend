import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { CertificationAdditionalScore } from '../../domain/entities/CertificationAdditionalScore';

export class ManageCertificationAdditionalScores {
    constructor(private additionalScoreRepository: ICertificationAdditionalScoreRepository) { }

    async create(data: Omit<CertificationAdditionalScore, 'id'>): Promise<CertificationAdditionalScore> {
        return this.additionalScoreRepository.create(data);
    }

    async getById(id: string): Promise<CertificationAdditionalScore | null> {
        return this.additionalScoreRepository.findById(id);
    }

    async getAll(): Promise<CertificationAdditionalScore[]> {
        return this.additionalScoreRepository.findAll();
    }

    async update(id: string, data: Partial<Omit<CertificationAdditionalScore, 'id'>>): Promise<CertificationAdditionalScore | null> {
        return this.additionalScoreRepository.update(id, data);
    }

    async delete(id: string): Promise<boolean> {
        return this.additionalScoreRepository.delete(id);
    }
}