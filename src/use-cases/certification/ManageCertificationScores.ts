import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { CertificationScore, CertificationScoreWithUser } from '../../domain/entities/CertificationScore';

export interface UpdateCertificationScoreData {
    additionalScore?: Record<string, number>;
    examScoreOverride?: number | null;
}

export class ManageCertificationScores {
    constructor(
        private certificationScoreRepository: ICertificationScoreRepository,
        private additionalScoreRepository: ICertificationAdditionalScoreRepository,
        private sectionSubmissionRepository: IExamSectionSubmissionRepository,
        private sectionRepository: IExamSectionRepository,
        private questionRepository: IQuestionRepository
    ) { }

    private async computeOriginalExamScore(examSubmissionId: string): Promise<number> {
        const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(examSubmissionId);

        let totalScore = 0;
        let maxScore = 0;
        for (const ss of sectionSubmissions) {
            totalScore += ss.totalScore || 0;
            const questions = await this.questionRepository.findBySectionId(ss.examSectionId);
            maxScore += questions.reduce((sum, q) => sum + (q.points || 0), 0);
        }

        if (maxScore === 0) return 0;
        return Math.round((totalScore / maxScore) * 1000) / 10;
    }

    async getAll(examSubmissionId?: string): Promise<CertificationScoreWithUser[]> {
        let scores: CertificationScoreWithUser[];
        if (examSubmissionId) {
            const score = await this.certificationScoreRepository.findByExamSubmissionId(examSubmissionId);
            scores = score ? [score] : [];
        } else {
            scores = await this.certificationScoreRepository.findAll();
        }

        return Promise.all(scores.map(async (score) => ({
            ...score,
            originalExamScore: await this.computeOriginalExamScore(score.examSubmissionId),
        })));
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