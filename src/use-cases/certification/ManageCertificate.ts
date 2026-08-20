import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../domain/repositories/ICertificationAdditionalScoreRepository';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { IEmailService } from '../../domain/repositories/IEmailService';
import { User } from '../../domain/entities/User';
import { CertificationScore } from '../../domain/entities/CertificationScore';
import { computeCertificateScore } from './certificateComputation';
import { createCertificatePdf, CertificatePdfData } from '../../infrastructure/pdf/certificatePdf';

export class ManageCertificate {
    constructor(
        private certificationScoreRepository: ICertificationScoreRepository,
        private additionalScoreRepository: ICertificationAdditionalScoreRepository,
        private userRepository: IUserRepository,
        private submissionRepository: IExamSubmissionRepository,
        private sectionSubmissionRepository: IExamSectionSubmissionRepository,
        private sectionRepository: IExamSectionRepository,
        private questionRepository: IQuestionRepository,
        private examRepository: IExamRepository,
        private emailService: IEmailService
    ) { }

    async getPdf(certificationScoreId: string): Promise<{ fullName: string; email: string; buffer: Buffer }> {
        const score = await this.certificationScoreRepository.findById(certificationScoreId);
        if (!score) {
            throw new Error('Certification score not found');
        }

        const user = await this.userRepository.findById(score.userId);
        if (!user) {
            throw new Error('User not found');
        }

        const data = await this.buildCertificateData(score, user);
        const buffer = await createCertificatePdf(data);

        return { fullName: user.fullName || user.email, email: user.email, buffer };
    }

    async emailBySubmission(examSubmissionId: string, baseUrl: string): Promise<{ to: string; fullName: string; downloadUrl: string }> {
        const score = await this.certificationScoreRepository.findByExamSubmissionId(examSubmissionId);
        if (!score) {
            throw new Error('Certification score not found');
        }

        const user = await this.userRepository.findById(score.userId);
        if (!user) {
            throw new Error('User not found');
        }

        const fullName = user.fullName || user.email;
        const downloadUrl = `${baseUrl.replace(/\/+$/, '')}/api/certification-scores/${score.id}/download`;

        await this.emailService.sendCertificateEmail(user.email, fullName, user.email, downloadUrl);

        return { to: user.email, fullName, downloadUrl };
    }

    private async buildCertificateData(score: CertificationScore, user: User): Promise<CertificatePdfData> {
        const submission = await this.submissionRepository.findById(score.examSubmissionId);
        const exam = submission ? await this.examRepository.findById(submission.examId) : null;

        let examScore = 0;
        let maxScore = 0;

        if (score.examScoreOverride == null) {
            const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(score.examSubmissionId);
            const sectionIds = [...new Set(sectionSubmissions.map(ss => ss.examSectionId))];
            const sections = await Promise.all(sectionIds.map(id => this.sectionRepository.findById(id)));

            for (const ss of sectionSubmissions) {
                examScore += ss.totalScore || 0;
                const section = sections.find(s => s?.id === ss.examSectionId);
                if (section) {
                    const questions = await this.questionRepository.findBySectionId(section.id);
                    maxScore += questions.reduce((sum, q) => sum + (q.points || 0), 0);
                }
            }
        }

        const configs = await this.additionalScoreRepository.findAll();
        const { examScore: resolvedExamScore, finalScore } = computeCertificateScore({
            examScoreOverride: score.examScoreOverride ?? null,
            examScore,
            maxScore,
            additionalScore: score.additionalScore,
            additionalConfigs: configs.map(c => ({ scoreName: c.scoreName, weight: c.weight })),
        });

        return {
            fullName: user.fullName || user.email,
            email: user.email,
            examTitle: exam?.title || null,
            examScore: resolvedExamScore,
            maxScore,
            finalScore,
            additionalScores: score.additionalScore,
        };
    }
}