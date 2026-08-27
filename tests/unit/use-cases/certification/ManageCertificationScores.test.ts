import { ManageCertificationScores } from '../../../../src/use-cases/certification/ManageCertificationScores';
import { ICertificationScoreRepository } from '../../../../src/domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../../../src/domain/repositories/ICertificationAdditionalScoreRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IStudentRepository } from '../../../../src/domain/repositories/IStudentRepository';
import { CertificationScore } from '../../../../src/domain/entities/CertificationScore';

describe('ManageCertificationScores Use Case', () => {
    let manageCertificationScores: ManageCertificationScores;
    let mockCertificationScoreRepo: jest.Mocked<ICertificationScoreRepository>;
    let mockAdditionalScoreRepo: jest.Mocked<ICertificationAdditionalScoreRepository>;
    let mockSectionSubmissionRepo: jest.Mocked<IExamSectionSubmissionRepository>;
    let mockSectionRepo: jest.Mocked<IExamSectionRepository>;
    let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
    let mockSubmissionRepo: jest.Mocked<IExamSubmissionRepository>;
    let mockExamRepo: jest.Mocked<IExamRepository>;
    let mockStudentRepo: jest.Mocked<IStudentRepository>;

    const baseScore: CertificationScore = {
        id: 'cert-1',
        userId: 1,
        examSubmissionId: 'sub-1',
        additionalScore: null,
        examScoreOverride: null,
    };

    beforeEach(() => {
        mockCertificationScoreRepo = {
            createForSubmission: jest.fn(),
            findById: jest.fn(),
            findByExamSubmissionId: jest.fn(),
            findAll: jest.fn(),
            updateAdditionalScore: jest.fn(),
            updateExamScoreOverride: jest.fn()
        } as unknown as jest.Mocked<ICertificationScoreRepository>;

        mockAdditionalScoreRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<ICertificationAdditionalScoreRepository>;

        mockSectionSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findBySubmissionId: jest.fn().mockResolvedValue([]),
            findBySubmissionAndSection: jest.fn(),
            findLatestBySubmissionId: jest.fn(),
            incrementTotalScore: jest.fn()
        } as unknown as jest.Mocked<IExamSectionSubmissionRepository>;

        mockSectionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByExamId: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn()
        } as unknown as jest.Mocked<IExamSectionRepository>;

        mockQuestionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn().mockResolvedValue([]),
            findByIds: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn()
        } as unknown as jest.Mocked<IQuestionRepository>;

        mockSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn().mockResolvedValue(null),
            findByUserAndExam: jest.fn(),
            findByUserId: jest.fn(),
            findAllWithDetails: jest.fn(),
            findByExamId: jest.fn().mockResolvedValue([])
        } as unknown as jest.Mocked<IExamSubmissionRepository>;

        mockExamRepo = {
            create: jest.fn(),
            findById: jest.fn().mockResolvedValue(null),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IExamRepository>;

        mockStudentRepo = {
            create: jest.fn(),
            findByUserId: jest.fn().mockResolvedValue(null),
            findAll: jest.fn()
        } as unknown as jest.Mocked<IStudentRepository>;

        manageCertificationScores = new ManageCertificationScores(
            mockCertificationScoreRepo,
            mockAdditionalScoreRepo,
            mockSectionSubmissionRepo,
            mockSectionRepo,
            mockQuestionRepo,
            mockSubmissionRepo,
            mockExamRepo,
            mockStudentRepo
        );
    });

    it('should get all certification scores', async () => {
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);

        const result = await manageCertificationScores.getAll();

        expect(mockCertificationScoreRepo.findAll).toHaveBeenCalledWith();
        expect(result).toEqual([{ ...baseScore, originalExamScore: 0, totalScore: 0, scores: [], overrides: [], groupNumber: null, degreeProgram: null, exam: undefined, student: undefined }]);
    });

    it('should filter certification scores by examId and return latest per user', async () => {
        const examId = 'exam-1';
        const olderSubmission = { id: 'sub-old', userId: 1, examId, status: 'submitted', startedAt: new Date('2023-01-01'), submittedAt: new Date('2023-01-01') } as any;
        const latestSubmission = { id: 'sub-1', userId: 1, examId, status: 'finished-late', startedAt: new Date('2023-02-01'), submittedAt: new Date('2023-02-01') } as any;
        mockSubmissionRepo.findByExamId.mockResolvedValue([olderSubmission, latestSubmission]);
        mockCertificationScoreRepo.findByExamSubmissionId.mockResolvedValue(baseScore);
        // Mock findById for enrichment of the latest score's submission
        mockSubmissionRepo.findById.mockResolvedValue(latestSubmission);
        mockExamRepo.findById.mockResolvedValue(null);
        mockStudentRepo.findByUserId.mockResolvedValue(null);

        const result = await manageCertificationScores.getAll(examId);

        expect(mockSubmissionRepo.findByExamId).toHaveBeenCalledWith(examId);
        expect(mockCertificationScoreRepo.findByExamSubmissionId).toHaveBeenCalledWith('sub-1');
        // Should only return the latest (sub-1), not the older one
        expect(result).toEqual([{ ...baseScore, originalExamScore: 0, totalScore: 0, scores: [], overrides: [], groupNumber: null, degreeProgram: null, exam: undefined, student: undefined }]);
        expect(result).toHaveLength(1);
    });

    it('should compute originalExamScore using per-section weights with equal-split remainder', async () => {
        // section-1 (weight 0.5, explicit): 18/20 pts -> 90
        // section-2 (NULL weight): shares remaining 0.5 -> 6/10 pts -> 60
        // weighted exam score = 90*0.5 + 60*0.5 = 75
        const scoreWithExam = { ...baseScore, id: 'cert-exam' };
        mockCertificationScoreRepo.findAll.mockResolvedValue([scoreWithExam]);
        mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([
            { id: 'ss-1', submissionId: 'sub-1', examSectionId: 'section-1', totalScore: 18 },
            { id: 'ss-2', submissionId: 'sub-1', examSectionId: 'section-2', totalScore: 6 },
        ] as any);
        mockSubmissionRepo.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'submitted',
            timezone: null, startedAt: new Date(), submittedAt: new Date()
        });
        mockExamRepo.findById.mockResolvedValue({ id: 'exam-1', title: 'TOEFL', type: 'TOEFL', isOnce: false });
        mockSectionRepo.findByExamId.mockResolvedValue([
            { id: 'section-1', examId: 'exam-1', title: 'Reading', instructions: null, orderIndex: 0, durationMinutes: 30, weight: 0.5 },
            { id: 'section-2', examId: 'exam-1', title: 'Listening', instructions: null, orderIndex: 1, durationMinutes: 30, weight: null },
        ]);
        mockQuestionRepo.findBySectionId.mockImplementation(async (sectionId: string) =>
            sectionId === 'section-1'
                ? ([{ points: 10 }, { points: 5 }, { points: 5 }] as any)
                : ([{ points: 4 }, { points: 3 }, { points: 3 }] as any)
        );

        const result = await manageCertificationScores.getAll();

        expect(result[0].originalExamScore).toBe(75);
        expect(result[0].totalScore).toBe(75); // no additional scores -> final equals weighted exam
        expect(result[0].overrides).toEqual([]);
        expect(result[0].scores).toHaveLength(2);

        const reading = result[0].scores!.find(s => s.sectionId === 'section-1')!;
        const listening = result[0].scores!.find(s => s.sectionId === 'section-2')!;
        expect(reading).toEqual({ sectionId: 'section-1', sectionName: 'Reading', correctPoints: 18, fullPoints: 20, scaledScore: 90 });
        expect(listening).toEqual({ sectionId: 'section-2', sectionName: 'Listening', correctPoints: 6, fullPoints: 10, scaledScore: 60 });
    });

    it('should apply per-section overrides in the response breakdown', async () => {
        // override replaces listening's computed 60 with 100 -> weighted = 45 + 50 = 95
        const scoreWithOverride = { ...baseScore, examScoreOverride: { 'section-2': 100 } };
        mockCertificationScoreRepo.findAll.mockResolvedValue([scoreWithOverride]);
        mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([
            { id: 'ss-1', submissionId: 'sub-1', examSectionId: 'section-1', totalScore: 18 },
            { id: 'ss-2', submissionId: 'sub-1', examSectionId: 'section-2', totalScore: 6 },
        ] as any);
        mockSubmissionRepo.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'submitted',
            timezone: null, startedAt: new Date(), submittedAt: new Date()
        });
        mockExamRepo.findById.mockResolvedValue({ id: 'exam-1', title: 'TOEFL', type: 'TOEFL', isOnce: false });
        mockSectionRepo.findByExamId.mockResolvedValue([
            { id: 'section-1', examId: 'exam-1', title: null, instructions: null, orderIndex: 0, durationMinutes: 30, weight: 0.5 },
            { id: 'section-2', examId: 'exam-1', title: null, instructions: null, orderIndex: 1, durationMinutes: 30, weight: null },
        ]);
        mockQuestionRepo.findBySectionId.mockImplementation(async (sectionId: string) =>
            sectionId === 'section-1'
                ? ([{ points: 10 }, { points: 5 }, { points: 5 }] as any)
                : ([{ points: 4 }, { points: 3 }, { points: 3 }] as any)
        );

        const result = await manageCertificationScores.getAll();

        expect(result[0].originalExamScore).toBe(95);
        // scores[] keeps the COMPUTED scaled score; overrides[] carries the replacement
        const listeningScore = result[0].scores!.find(s => s.sectionId === 'section-2')!;
        expect(listeningScore.scaledScore).toBe(60);
        expect(result[0].overrides).toEqual([
            { sectionId: 'section-2', sectionName: null, overriddenScore: 100 },
        ]);
    });

    it('should return originalExamScore of 0 when the submission has no section submissions', async () => {
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);
        mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([]);

        const result = await manageCertificationScores.getAll();

        expect(result[0].originalExamScore).toBe(0);
    });

    it('should resolve the exam entity from the exam submission', async () => {
        const mockExam = { id: 'exam-1', title: 'TOEFL Practice', type: 'TOEFL', isOnce: false };
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);
        mockSubmissionRepo.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'submitted',
            timezone: null, startedAt: new Date(), submittedAt: new Date()
        });
        mockExamRepo.findById.mockResolvedValue(mockExam);

        const result = await manageCertificationScores.getAll();

        expect(mockSubmissionRepo.findById).toHaveBeenCalledWith('sub-1');
        expect(mockExamRepo.findById).toHaveBeenCalledWith('exam-1');
        expect(result[0].exam).toEqual(mockExam);
    });

    it('should omit exam when the exam submission no longer exists', async () => {
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);

        const result = await manageCertificationScores.getAll();

        expect(result[0].exam).toBeUndefined();
    });

    it('should return empty array when filtering by unknown examId', async () => {
        mockSubmissionRepo.findByExamId.mockResolvedValue([]);

        const result = await manageCertificationScores.getAll('missing-exam-id');

        expect(mockSubmissionRepo.findByExamId).toHaveBeenCalledWith('missing-exam-id');
        expect(result).toEqual([]);
    });

    it('should update additional score when all keys are valid', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue(baseScore);
        mockAdditionalScoreRepo.findAll.mockResolvedValue([
            { id: 'as-1', scoreName: 'class_speaking_score', weight: 0.5 },
            { id: 'as-2', scoreName: 'class_individual_task_score', weight: 0.5 },
        ]);
        const additionalScore = { class_speaking_score: 95, class_individual_task_score: 80 };
        const mockUpdated = { ...baseScore, additionalScore } as CertificationScore;
        mockCertificationScoreRepo.updateAdditionalScore.mockResolvedValue(mockUpdated);

        const result = await manageCertificationScores.update('cert-1', { additionalScore });

        expect(mockCertificationScoreRepo.updateAdditionalScore).toHaveBeenCalledWith('cert-1', additionalScore);
        expect(result).toEqual(mockUpdated);
    });

    it('should update the exam score override', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue(baseScore);
        const overrideMap = { 'section-1': 88 };
        const mockUpdated = { ...baseScore, examScoreOverride: overrideMap };
        mockCertificationScoreRepo.updateExamScoreOverride.mockResolvedValue(mockUpdated);

        const result = await manageCertificationScores.update('cert-1', { examScoreOverride: overrideMap });

        expect(mockCertificationScoreRepo.updateExamScoreOverride).toHaveBeenCalledWith('cert-1', overrideMap);
        expect(mockCertificationScoreRepo.updateAdditionalScore).not.toHaveBeenCalled();
        expect(result).toEqual(mockUpdated);
    });

    it('should clear the exam score override when null is provided', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue({ ...baseScore, examScoreOverride: { 'section-1': 88 } });
        const mockUpdated = { ...baseScore, examScoreOverride: null } as CertificationScore;
        mockCertificationScoreRepo.updateExamScoreOverride.mockResolvedValue(mockUpdated);

        const result = await manageCertificationScores.update('cert-1', { examScoreOverride: null });

        expect(mockCertificationScoreRepo.updateExamScoreOverride).toHaveBeenCalledWith('cert-1', null);
        expect(result).toEqual(mockUpdated);
    });

    it('should update both additional score and override in one call', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue(baseScore);
        mockAdditionalScoreRepo.findAll.mockResolvedValue([
            { id: 'as-1', scoreName: 'class_speaking_score', weight: 0.5 },
        ]);
        mockCertificationScoreRepo.updateAdditionalScore.mockResolvedValue({
            ...baseScore,
            additionalScore: { class_speaking_score: 90 },
        });
        mockCertificationScoreRepo.updateExamScoreOverride.mockResolvedValue({
            ...baseScore,
            additionalScore: { class_speaking_score: 90 },
            examScoreOverride: { 'section-1': 85 },
        });

        const result = await manageCertificationScores.update('cert-1', {
            additionalScore: { class_speaking_score: 90 },
            examScoreOverride: { 'section-1': 85 },
        });

        expect(mockCertificationScoreRepo.updateAdditionalScore).toHaveBeenCalledWith('cert-1', { class_speaking_score: 90 });
        expect(mockCertificationScoreRepo.updateExamScoreOverride).toHaveBeenCalledWith('cert-1', { 'section-1': 85 });
        expect(result).toEqual({ ...baseScore, additionalScore: { class_speaking_score: 90 }, examScoreOverride: { 'section-1': 85 } });
    });

    it('should throw when a key does not match a configured score name', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue(baseScore);
        mockAdditionalScoreRepo.findAll.mockResolvedValue([
            { id: 'as-1', scoreName: 'class_speaking_score', weight: 0.5 },
        ]);

        await expect(manageCertificationScores.update('cert-1', { additionalScore: { not_configured: 90 } }))
            .rejects.toThrow('Unknown additional score name: not_configured');
    });

    it('should throw when certification score is not found', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue(null);

        await expect(manageCertificationScores.update('missing', { examScoreOverride: { 'section-1': 90 } }))
            .rejects.toThrow('Certification score not found');
    });
});
