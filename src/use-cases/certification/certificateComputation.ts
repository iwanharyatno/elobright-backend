export interface AdditionalScoreConfig {
    scoreName: string;
    weight: number;
}

export interface SectionScoreInput {
    examSectionId: string;
    title?: string | null;
    totalScore: number;
    maxPoints: number;
}

export interface SectionWeightInput {
    examSectionId: string;
    weight: number | null;
}

export interface CertificateScoreInput {
    sections: SectionScoreInput[];
    weights: SectionWeightInput[];
    overrides: Record<string, number> | null;
    additionalScore: Record<string, number> | null;
    additionalConfigs: AdditionalScoreConfig[];
}

export interface ExamSectionBreakdown {
    examSectionId: string;
    /** Raw performance-based score derived from points (never affected by overrides). */
    computedScaledScore: number;
    /** Final score used in computation (equals the override value when overridden). */
    scaledScore: number;
    effectiveWeight: number;
    overridden: boolean;
    contribution: number;
}

export interface CertificateScoreResult {
    examSections: ExamSectionBreakdown[];
    weightedExamScore: number;
    finalScore: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Allocates an effective weight to every section:
 * - Sections with an explicit weight keep it.
 * - The remaining budget (clamped to >= 0) is split equally
 *   among the sections without a weight (NULL).
 * - If every section is NULL, they share 1.0 equally.
 */
export const allocateEffectiveWeights = (
    sections: SectionScoreInput[],
    weights: SectionWeightInput[]
): Map<string, number> => {
    const weightById = new Map(weights.map(w => [w.examSectionId, w.weight]));

    const explicitTotal = sections.reduce((sum, s) => {
        const w = weightById.get(s.examSectionId);
        return sum + (w != null ? w : 0);
    }, 0);

    const nullIds = sections.filter(s => weightById.get(s.examSectionId) == null).map(s => s.examSectionId);
    const remainder = Math.max(0, Math.min(1, 1 - explicitTotal));
    const nullShare = nullIds.length > 0 ? remainder / nullIds.length : 0;

    const effective = new Map<string, number>();
    for (const s of sections) {
        const w = weightById.get(s.examSectionId);
        effective.set(s.examSectionId, w != null ? w : nullShare);
    }
    return effective;
};

export const computeCertificateScore = (input: CertificateScoreInput): CertificateScoreResult => {
    const effectiveWeights = allocateEffectiveWeights(input.sections, input.weights);
    const overrides = input.overrides || {};
    // Case-insensitive lookup but preserve original key casing for display
    const overridesLower = new Map<string, number>();
    for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === 'number') overridesLower.set(k.toLowerCase(), v);
    }

    let weightedExamScore = 0;
    const examSections: ExamSectionBreakdown[] = input.sections.map(section => {
        const overrideKey = section.title ?? section.examSectionId;
        const overrideKeyLower = overrideKey?.toLowerCase();
        const idLower = section.examSectionId.toLowerCase();
        const hasTitleOverride = overrideKeyLower != null && overridesLower.has(overrideKeyLower);
        const hasIdOverride = overridesLower.has(idLower);
        const overridden = hasTitleOverride || hasIdOverride;
        const overrideValue = hasTitleOverride ? overridesLower.get(overrideKeyLower!) : overridesLower.get(idLower);
        const computedScaled = section.maxPoints > 0 ? (section.totalScore / section.maxPoints) * 100 : 0;
        const scaledScore = overridden ? (overrideValue as number) : computedScaled;
        const effectiveWeight = effectiveWeights.get(section.examSectionId) ?? 0;
        const contribution = scaledScore * effectiveWeight;

        weightedExamScore += contribution;

        return {
            examSectionId: section.examSectionId,
            computedScaledScore: round1(computedScaled),
            scaledScore: round1(scaledScore),
            effectiveWeight,
            overridden,
            contribution: round1(contribution),
        };
    });

    const additionalTotal = input.additionalScore
        ? Object.entries(input.additionalScore).reduce((sum, [key, value]) => {
            const config = input.additionalConfigs.find(c => c.scoreName.toLowerCase() === key.toLowerCase());
            return sum + value * (config ? config.weight : 0);
        }, 0)
        : 0;

    const finalScore = weightedExamScore + additionalTotal;

    return {
        examSections,
        weightedExamScore: round1(weightedExamScore),
        finalScore: round1(finalScore),
    };
};