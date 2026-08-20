export interface AdditionalScoreConfig {
    scoreName: string;
    weight: number;
}

export interface CertificateScoreInput {
    examScoreOverride?: number | null;
    examScore: number;
    maxScore: number;
    additionalScore: Record<string, number> | null;
    additionalConfigs: AdditionalScoreConfig[];
}

export interface CertificateScoreResult {
    examScore: number;
    examWeight: number;
    finalScore: number;
}

export const computeCertificateScore = (input: CertificateScoreInput): CertificateScoreResult => {
    const totalAdditionalWeight = input.additionalConfigs.reduce((sum, c) => sum + c.weight, 0);
    const examWeight = Math.max(0, Math.min(1, 1 - totalAdditionalWeight));

    const examScore = input.examScoreOverride != null
        ? input.examScoreOverride
        : input.maxScore > 0
            ? (input.examScore / input.maxScore) * 100
            : 0;

    const additionalTotal = input.additionalScore
        ? Object.entries(input.additionalScore).reduce((sum, [key, value]) => {
            const config = input.additionalConfigs.find(c => c.scoreName === key);
            return sum + value * (config ? config.weight : 0);
        }, 0)
        : 0;

    const finalScore = examScore * examWeight + additionalTotal;

    return {
        examScore: Math.round(examScore * 10) / 10,
        examWeight,
        finalScore: Math.round(finalScore * 10) / 10,
    };
};