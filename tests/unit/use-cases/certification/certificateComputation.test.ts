import { computeCertificateScore } from '../../../../src/use-cases/certification/certificateComputation';

describe('computeCertificateScore', () => {
    const configs = [
        { scoreName: 'class_speaking_score', weight: 0.3 },
        { scoreName: 'class_individual_task_score', weight: 0.2 },
    ];

    it('should normalize the exam score to a percentage and combine with weighted additional scores', () => {
        const result = computeCertificateScore({
            examScoreOverride: null,
            examScore: 18,
            maxScore: 36,
            additionalScore: { class_speaking_score: 95, class_individual_task_score: 80 },
            additionalConfigs: configs,
        });

        expect(result.examScore).toBe(50);
        expect(result.examWeight).toBe(0.5);
        expect(result.finalScore).toBe(50 * 0.5 + 95 * 0.3 + 80 * 0.2);
    });

    it('should prioritize the override over the computed exam score', () => {
        const result = computeCertificateScore({
            examScoreOverride: 88,
            examScore: 9,
            maxScore: 36,
            additionalScore: { class_speaking_score: 95, class_individual_task_score: 80 },
            additionalConfigs: configs,
        });

        expect(result.examScore).toBe(88);
        expect(result.examWeight).toBe(0.5);
        expect(result.finalScore).toBe(88 * 0.5 + 95 * 0.3 + 80 * 0.2);
    });

    it('should fall back to computed score when override is null', () => {
        const result = computeCertificateScore({
            examScoreOverride: null,
            examScore: 36,
            maxScore: 36,
            additionalScore: null,
            additionalConfigs: configs,
        });

        expect(result.examScore).toBe(100);
        expect(result.finalScore).toBe(100 * 0.5);
    });

    it('should handle maxScore of zero without dividing by zero', () => {
        const result = computeCertificateScore({
            examScoreOverride: null,
            examScore: 0,
            maxScore: 0,
            additionalScore: null,
            additionalConfigs: configs,
        });

        expect(result.examScore).toBe(0);
        expect(result.finalScore).toBe(0);
    });

    it('should clamp the exam weight to 0 when additional weights sum to >= 1', () => {
        const result = computeCertificateScore({
            examScoreOverride: null,
            examScore: 50,
            maxScore: 100,
            additionalScore: null,
            additionalConfigs: [
                { scoreName: 'a', weight: 0.6 },
                { scoreName: 'b', weight: 0.6 },
            ],
        });

        expect(result.examWeight).toBe(0);
    });

    it('should ignore additional score keys without a matching weight config', () => {
        const result = computeCertificateScore({
            examScoreOverride: null,
            examScore: 100,
            maxScore: 100,
            additionalScore: { unknown_key: 100, class_speaking_score: 50 },
            additionalConfigs: configs,
        });

        expect(result.finalScore).toBe(100 * 0.5 + 50 * 0.3);
    });
});