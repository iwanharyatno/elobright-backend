export interface CertificationScore {
    id: string;
    userId: number;
    examSubmissionId: string;
    additionalScore: Record<string, number> | null;
    examScoreOverride?: number | null;
}