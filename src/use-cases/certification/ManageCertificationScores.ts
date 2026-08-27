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
            return { examSectionId: s.id, title: s.title ?? null, totalScore: totalBySection.get(s.id) ?? 0, maxPoints };
        }));

        const rawConfigs = await this.additionalScoreRepository.findAll();
        const configs = Array.isArray(rawConfigs) ? rawConfigs : [];
        const additionalConfigs = configs.map(c => ({ scoreName: c.scoreName, weight: c.weight }));

        const { examSections: breakdown, weightedExamScore, finalScore } = computeCertificateScore({
            sections,
            weights,
            overrides,
            additionalScore,
            additionalConfigs,
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

    async getAll(examId?: string): Promise<CertificationScoreWithUser[]> {
        let scores: CertificationScoreWithUser[];
        if (examId) {
            // Filter by examId: get latest submission per user for that exam
            const submissions = await this.submissionRepository.findByExamId(examId);
            const latestByUser = new Map<number, typeof submissions[0]>();
            for (const sub of submissions) {
                const existing = latestByUser.get(sub.userId);
                if (!existing) {
                    latestByUser.set(sub.userId, sub);
                } else {
                    const existingTime = existing.startedAt ? new Date(existing.startedAt).getTime() : 0;
                    const currentTime = sub.startedAt ? new Date(sub.startedAt).getTime() : 0;
                    if (currentTime > existingTime || (currentTime === existingTime && (sub.submittedAt ? new Date(sub.submittedAt).getTime() : 0) > (existing.submittedAt ? new Date(existing.submittedAt).getTime() : 0))) {
                        latestByUser.set(sub.userId, sub);
                    }
                }
            }
            const latestIds = Array.from(latestByUser.values()).map(s => s.id);
            const certScores = await Promise.all(latestIds.map(id => this.certificationScoreRepository.findByExamSubmissionId(id)));
            scores = certScores.filter((c): c is CertificationScoreWithUser => c !== null);
        } else {
            const allScores = await this.certificationScoreRepository.findAll();
            // Deduplicate to latest per user per exam
            const enriched = await Promise.all(allScores.map(async s => {
                const sub = await this.submissionRepository.findById(s.examSubmissionId);
                return { score: s, submission: sub };
            }));
            const latestMap = new Map<string, typeof enriched[0]>();
            for (const item of enriched) {
                if (!item.submission) {
                    // Keep scores with missing submission as-is (no dedup)
                    latestMap.set(`no-sub-${item.score.id}`, item);
                    continue;
                }
                const key = `${item.score.userId}-${item.submission.examId}`;
                const existing = latestMap.get(key);
                if (!existing) {
                    latestMap.set(key, item);
                } else {
                    const existingTime = existing.submission?.startedAt ? new Date(existing.submission.startedAt).getTime() : 0;
                    const currentTime = item.submission?.startedAt ? new Date(item.submission.startedAt).getTime() : 0;
                    if (currentTime > existingTime || (currentTime === existingTime && (item.submission?.submittedAt ? new Date(item.submission.submittedAt).getTime() : 0) > (existing.submission?.submittedAt ? new Date(existing.submission.submittedAt).getTime() : 0))) {
                        latestMap.set(key, item);
                    }
                }
            }
            scores = Array.from(latestMap.values()).map(v => v.score);
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
            const validNamesLower = new Set(configuredNames.map(s => s.scoreName.toLowerCase()));
            const invalidKey = Object.keys(data.additionalScore).find(key => !validNamesLower.has(key.toLowerCase()));
            if (invalidKey) {
                throw new Error(`Unknown additional score name: ${invalidKey}`);
            }
        }

        if (data.examScoreOverride) {
            const submission = await this.submissionRepository.findById(existing.examSubmissionId);
            if (submission) {
                const examSections = await this.sectionRepository.findByExamId(submission.examId);
                const validSectionNamesLower = new Set(examSections.map(s => (s.title ?? s.id).toLowerCase()));
                const invalidKey = Object.keys(data.examScoreOverride).find(key => !validSectionNamesLower.has(key.toLowerCase()));
                if (invalidKey) {
                    throw new Error(`Unknown section name: ${invalidKey}`);
                }
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