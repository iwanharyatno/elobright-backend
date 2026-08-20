import { CertificationAdditionalScore } from '../entities/CertificationAdditionalScore';

export interface ICertificationAdditionalScoreRepository {
    create(data: Omit<CertificationAdditionalScore, 'id'>): Promise<CertificationAdditionalScore>;
    findById(id: string): Promise<CertificationAdditionalScore | null>;
    findAll(): Promise<CertificationAdditionalScore[]>;
    update(id: string, data: Partial<Omit<CertificationAdditionalScore, 'id'>>): Promise<CertificationAdditionalScore | null>;
    delete(id: string): Promise<boolean>;
}