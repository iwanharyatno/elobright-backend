import { CertificationScore, CertificationScoreWithUser } from '../entities/CertificationScore';

export interface ICertificationScoreRepository {
    createForSubmission(userId: number, examSubmissionId: string): Promise<CertificationScore | null>;
    findById(id: string): Promise<CertificationScore | null>;
    findByExamSubmissionId(examSubmissionId: string): Promise<CertificationScoreWithUser | null>;
    findAll(): Promise<CertificationScoreWithUser[]>;
    updateAdditionalScore(id: string, additionalScore: Record<string, number>): Promise<CertificationScore | null>;
    updateExamScoreOverride(id: string, examScoreOverride: Record<string, number> | null): Promise<CertificationScore | null>;
}