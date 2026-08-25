import {
    computeCertificateScore,
    allocateEffectiveWeights,
    SectionScoreInput,
    SectionWeightInput,
} from '../../../../src/use-cases/certification/certificateComputation';

describe('computeCertificateScore', () => {
    const configs = [
        { scoreName: 'class_speaking_score', weight: 0.3 },
        { scoreName: 'class_individual_task_score', weight: 0.2 },
    ];

    const makeSections = (): SectionScoreInput[] => [
        { examSectionId: 'reading', totalScore: 5, maxPoints: 5 },
        { examSectionId: 'listening', totalScore: 0, maxPoints: 5 },
        { examSectionId: 'writing', totalScore: 2, maxPoints: 4 },
        { examSectionId: 'speaking', totalScore: 1, maxPoints: 4 },
    ];

    const makeWeights = (weights: Record<string, number | null>): SectionWeightInput[] =>
        Object.entries(weights).map(([examSectionId, weight]) => ({ examSectionId, weight }));

    it('should split the remaining weight equally among NULL-weight sections', () => {
        // explicit: reading 0.3 -> remaining 0.7 shared by listening/writing/speaking
        const result = computeCertificateScore({
            sections: makeSections(),
            weights: makeWeights({ reading: 0.3, listening: null, writing: null, speaking: null }),
            overrides: null,
            additionalScore: null,
            additionalConfigs: [],
        });

        const byId = new Map(result.examSections.map(s => [s.examSectionId, s]));
        expect(byId.get('reading')!.effectiveWeight).toBeCloseTo(0.3);
        expect(byId.get('listening')!.effectiveWeight).toBeCloseTo(0.7 / 3);
        expect(byId.get('writing')!.effectiveWeight).toBeCloseTo(0.7 / 3);
        expect(byId.get('speaking')!.effectiveWeight).toBeCloseTo(0.7 / 3);

        // scaled: reading 100, listening 0, writing 50, speaking 25
        expect(byId.get('reading')!.scaledScore).toBe(100);
        expect(byId.get('listening')!.scaledScore).toBe(0);
        expect(byId.get('writing')!.scaledScore).toBe(50);
        expect(byId.get('speaking')!.scaledScore).toBe(25);

        // weighted exam score = 100*0.3 + 50*(0.7/3) + 25*(0.7/3) = 47.5
        expect(result.weightedExamScore).toBeCloseTo(47.5);
    });

    it('should share the full budget equally when every weight is NULL', () => {
        const result = computeCertificateScore({
            sections: makeSections(),
            weights: makeWeights({ reading: null, listening: null, writing: null, speaking: null }),
            overrides: null,
            additionalScore: null,
            additionalConfigs: [],
        });

        result.examSections.forEach(s => expect(s.effectiveWeight).toBeCloseTo(0.25));
        // (100 + 0 + 50 + 25) * 0.25 = 43.75 -> rounded to 1 decimal
        expect(result.weightedExamScore).toBe(43.8);
    });

    it('should clamp the remainder to 0 when explicit weights exceed 1', () => {
        const effective = allocateEffectiveWeights(
            [{ examSectionId: 'a', totalScore: 0, maxPoints: 0 }, { examSectionId: 'b', totalScore: 0, maxPoints: 0 }, { examSectionId: 'c', totalScore: 0, maxPoints: 0 }],
            makeWeights({ a: 0.8, b: 0.8, c: null })
        );
        expect(effective.get('a')).toBe(0.8);
        expect(effective.get('b')).toBe(0.8);
        expect(effective.get('c')).toBe(0); // remainder clamped to >= 0
    });

    it('should replace a single section score via the override JSON while others stay computed', () => {
        const result = computeCertificateScore({
            sections: makeSections(),
            weights: makeWeights({ reading: 0.3, listening: null, writing: null, speaking: null }),
            overrides: { reading: 80 },
            additionalScore: null,
            additionalConfigs: [],
        });

        const byId = new Map(result.examSections.map(s => [s.examSectionId, s]));
        expect(byId.get('reading')!.overridden).toBe(true);
        expect(byId.get('reading')!.scaledScore).toBe(80);
        expect(byId.get('listening')!.overridden).toBe(false);
        expect(byId.get('writing')!.overridden).toBe(false);

        // 80*0.3 + 50*(0.7/3) + 25*(0.7/3) = 41.5
        expect(result.weightedExamScore).toBeCloseTo(41.5);
    });

    it('should treat unattempted sections as 0 while still consuming their weight', () => {
        const sections: SectionScoreInput[] = [
            { examSectionId: 'reading', totalScore: 5, maxPoints: 5 },
            { examSectionId: 'listening', totalScore: 0, maxPoints: 5 }, // never attempted
        ];
        const result = computeCertificateScore({
            sections,
            weights: makeWeights({ reading: 0.6, listening: 0.4 }),
            overrides: null,
            additionalScore: null,
            additionalConfigs: [],
        });

        // 100*0.6 + 0*0.4
        expect(result.weightedExamScore).toBeCloseTo(60);
    });

    it('should add weighted additional scores on top of the weighted exam score', () => {
        const result = computeCertificateScore({
            sections: [makeSections()[0]], // reading 100
            weights: makeWeights({ reading: 0.5 }),
            overrides: null,
            additionalScore: { class_speaking_score: 95, class_individual_task_score: 80 },
            additionalConfigs: configs,
        });

        // exam 100*0.5 = 50; additional 95*0.3 + 80*0.2 = 44.5 -> final 94.5
        expect(result.finalScore).toBeCloseTo(94.5);
    });

    it('should ignore unknown keys in additional scores without a matching config', () => {
        const result = computeCertificateScore({
            sections: [{ examSectionId: 'only', totalScore: 10, maxPoints: 10 }],
            weights: makeWeights({ only: 1 }),
            overrides: null,
            additionalScore: { unknown_key: 100, class_speaking_score: 50 },
            additionalConfigs: configs,
        });

        // exam 100 + 50*0.3 = 115
        expect(result.finalScore).toBeCloseTo(115);
    });

    it('should handle sections whose questions total zero points', () => {
        const result = computeCertificateScore({
            sections: [{ examSectionId: 'empty', totalScore: 0, maxPoints: 0 }],
            weights: makeWeights({ empty: 1 }),
            overrides: null,
            additionalScore: null,
            additionalConfigs: [],
        });

        expect(result.examSections[0].scaledScore).toBe(0);
        expect(result.weightedExamScore).toBe(0);
    });
});