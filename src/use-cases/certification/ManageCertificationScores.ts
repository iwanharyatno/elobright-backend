import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { IStudentRepository } from '../../domain/repositories/IStudentRepository';
import { CertificationScore, CertificationScoreWithUser } from '../../domain/entities/CertificationScore';
import { computeCertificateScore, SectionScoreInput, SectionWeightInput } from './certificateComputation';

export interface UpdateCertificationScoreData {
    additionalScore?: Record<string, number>;
    examScoreOverride?: Record<string, number> | null;
}

export class ManageCertificationScores {
    constructor(
        private certificationScoreRepository: ICertificationScoreRepository,
        private additionalScoreRepository: ICertificationAdditionalScoreRepository,
        private sectionSubmissionRepository: IExamSectionSubmissionRepository,
        private sectionRepository: IExamSectionRepository,
        private questionRepository: IQuestionRepository,
        private submissionRepository: IExamSubmissionRepository,
        private examRepository: IExamRepository,
        private studentRepository: IStudentRepository
    ) { }

    private async buildSectionBreakdown(
        examId: string | null,
        examSubmissionId: string,
        overrides: Record<string, number> | null,
        additionalScore: Record<string, number> | null
    ): Promise<{
        scores: CertificationScoreWithUser['scores'];
        overridesList: CertificationScoreWithUser['overrides'];
        weightedExamScore: number;
        totalScore: number;
    }> {
        if (!examId) return { scores: [], overridesList: [], weightedExamScore: 0, totalScore: 0 };

        const examSections = await this.sectionRepository.findByExamId(examId);
        if (examSections.length === 0) return { scores: [], overridesList: [], weightedExamScore: 0, totalScore: 0 };

        const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(examSubmissionId);
        const totalBySection = new Map(sectionSubmissions.map(ss => [ss.examSectionId, ss.totalScore || 0]));

        const weights: SectionWeightInput[] = examSections.map(s => ({ examSectionId: s.id, weight: s.weight ?? null }));
        const sections: SectionScoreInput[] = await Promise.all(examSections.map(async (s) => {
            const questions = await this.questionRepository.findBySectionId(s.id);
            const maxPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);
            return { examSectionId: s.id, totalScore: totalBySection.get(s.id) ?? 0, maxPoints };
        }));

        const { examSections: breakdown, weightedExamScore, finalScore } = computeCertificateScore({
            sections,
            weights,
            overrides,
            additionalScore,
            additionalConfigs: [],
        });

        const titleById = new Map(examSections.map(s => [s.id, s.title || null]));
        const pointsById = new Map(sections.map(s => [s.examSectionId, s.maxPoints]));

        return {
            weightedExamScore,
            totalScore: finalScore,
            scores: breakdown.map(b => ({
                sectionId: b.examSectionId,
                sectionName: titleById.get(b.examSectionId) ?? null,
                correctPoints: totalBySection.get(b.examSectionId) ?? 0,
                fullPoints: pointsById.get(b.examSectionId) ?? 0,
                scaledScore: b.computedScaledScore,
            })),
            overridesList: breakdown
                .filter(b => b.overridden)
                .map(b => ({
                    sectionId: b.examSectionId,
                    sectionName: titleById.get(b.examSectionId) ?? null,
                    overriddenScore: b.scaledScore,
                })),
        };
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
            const student = await this.studentRepository.findByUserId(score.userId);
            const { scores: sectionScores, overridesList, weightedExamScore, totalScore } = await this.buildSectionBreakdown(
                submission?.examId ?? null,
                score.examSubmissionId,
                score.examScoreOverride ?? null,
                score.additionalScore
            );
            const groupNumber = (submission as any)?.groupNumber ?? null;
            const degreeProgram = (student as any)?.degreeProgram ?? null;
            return {
                ...score,
                originalExamScore: weightedExamScore,
                totalScore,
                exam: exam || undefined,
                student: student || undefined,
                scores: sectionScores,
                overrides: overridesList,
                groupNumber,
                degreeProgram,
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