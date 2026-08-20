import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { CertificationScore } from '../../domain/entities/CertificationScore';

export interface UpdateCertificationScoreData {
    additionalScore?: Record<string, number>;
    examScoreOverride?: number | null;
}

export class ManageCertificationScores {
    constructor(
        private certificationScoreRepository: ICertificationScoreRepository,
        private additionalScoreRepository: ICertificationAdditionalScoreRepository
    ) { }

    async getAll(examSubmissionId?: string): Promise<CertificationScore[]> {
        if (examSubmissionId) {
            const score = await this.certificationScoreRepository.findByExamSubmissionId(examSubmissionId);
            return score ? [score] : [];
        }
        return this.certificationScoreRepository.findAll();
    }

    async update(id: string, data: UpdateCertificationScoreData): Promise<CertificationScore | null> {
        const existing = await this.certificationScoreRepository.findById(id);
        if (!existing) {
            throw new Error('Certification score not found');
        }

        if (data.additionalScore) {
            const configuredNames = await this.additionalScoreRepository.findAll();
            const validNames = new Set(configuredNames.map(s => s.scoreName));
            const invalidKey = Object.keys(data.additionalScore).find(key => !validNames.has(key));
            if (invalidKey) {
                throw new Error(`Unknown additional score name: ${invalidKey}`);
            }
        }

        let updated = existing;
        if (data.additionalScore) {
            updated = (await this.certificationScoreRepository.updateAdditionalScore(id, data.additionalScore)) ?? updated;
        }
        if (data.examScoreOverride !== undefined) {
            updated = (await this.certificationScoreRepository.updateExamScoreOverride(id, data.examScoreOverride)) ?? updated;
        }

        return updated;
    }
}