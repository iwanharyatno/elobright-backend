import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
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
        private questionRepository: IQuestionRepository,
        private submissionRepository: IExamSubmissionRepository,
        private examRepository: IExamRepository
    ) { }

    private async computeOriginalExamScore(examId: string | null, examSubmissionId: string): Promise<number> {
        if (!examId) return 0;

        const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(examSubmissionId);
        const totalScore = sectionSubmissions.reduce((sum, ss) => sum + (ss.totalScore || 0), 0);

        const examSections = await this.sectionRepository.findByExamId(examId);
        let maxScore = 0;
        for (const section of examSections) {
            const questions = await this.questionRepository.findBySectionId(section.id);
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

        return Promise.all(scores.map(async (score) => {
            const submission = await this.submissionRepository.findById(score.examSubmissionId);
            const exam = submission ? await this.examRepository.findById(submission.examId) : null;
            return {
                ...score,
                originalExamScore: await this.computeOriginalExamScore(submission?.examId ?? null, score.examSubmissionId),
                exam: exam || undefined,
            };
        }));
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