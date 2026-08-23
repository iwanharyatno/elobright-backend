import { ManageCertificationScores } from '../../../../src/use-cases/certification/ManageCertificationScores';
import { ICertificationScoreRepository } from '../../../../src/domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../../../src/domain/repositories/ICertificationAdditionalScoreRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
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
            findAllWithDetails: jest.fn()
        } as unknown as jest.Mocked<IExamSubmissionRepository>;

        mockExamRepo = {
            create: jest.fn(),
            findById: jest.fn().mockResolvedValue(null),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IExamRepository>;

        manageCertificationScores = new ManageCertificationScores(
            mockCertificationScoreRepo,
            mockAdditionalScoreRepo,
            mockSectionSubmissionRepo,
            mockSectionRepo,
            mockQuestionRepo,
            mockSubmissionRepo,
            mockExamRepo
        );
    });

    it('should get all certification scores', async () => {
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);

        const result = await manageCertificationScores.getAll();

        expect(mockCertificationScoreRepo.findAll).toHaveBeenCalledWith();
        expect(result).toEqual([{ ...baseScore, originalExamScore: 0 }]);
    });

    it('should filter certification scores by exam submission id', async () => {
        mockCertificationScoreRepo.findByExamSubmissionId.mockResolvedValue(baseScore);

        const result = await manageCertificationScores.getAll('sub-1');

        expect(mockCertificationScoreRepo.findByExamSubmissionId).toHaveBeenCalledWith('sub-1');
        expect(result).toEqual([{ ...baseScore, originalExamScore: 0 }]);
    });

    it('should compute originalExamScore scaled to 0-100 across all exam sections', async () => {
        // attempted: section-1 totalScore 18; exam has section-1 (20 pts) + section-2 (10 pts) -> 18/30 = 60
        const scoreWithExam = { ...baseScore, id: 'cert-exam' };
        mockCertificationScoreRepo.findAll.mockResolvedValue([scoreWithExam]);
        mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([
            { id: 'ss-1', submissionId: 'sub-1', examSectionId: 'section-1', totalScore: 18 },
        ] as any);
        mockSubmissionRepo.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'submitted',
            timezone: null, startedAt: new Date(), submittedAt: new Date()
        });
        mockExamRepo.findById.mockResolvedValue({ id: 'exam-1', title: 'TOEFL', type: 'TOEFL', isOnce: false });
        mockSectionRepo.findByExamId.mockResolvedValue([
            { id: 'section-1', examId: 'exam-1', title: null, instructions: null, orderIndex: 0, durationMinutes: 30 },
            { id: 'section-2', examId: 'exam-1', title: null, instructions: null, orderIndex: 1, durationMinutes: 30 },
        ]);
        mockQuestionRepo.findBySectionId.mockImplementation(async (sectionId: string) =>
            sectionId === 'section-1'
                ? ([{ points: 10 }, { points: 5 }, { points: 5 }] as any)
                : ([{ points: 4 }, { points: 3 }, { points: 3 }] as any)
        );

        const result = await manageCertificationScores.getAll();

        expect(result[0].originalExamScore).toBe(60);
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

    it('should return empty array when filtering by unknown exam submission id', async () => {
        mockCertificationScoreRepo.findByExamSubmissionId.mockResolvedValue(null);

        const result = await manageCertificationScores.getAll('missing');

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
        const mockUpdated = { ...baseScore, examScoreOverride: 88 } as CertificationScore;
        mockCertificationScoreRepo.updateExamScoreOverride.mockResolvedValue(mockUpdated);

        const result = await manageCertificationScores.update('cert-1', { examScoreOverride: 88 });

        expect(mockCertificationScoreRepo.updateExamScoreOverride).toHaveBeenCalledWith('cert-1', 88);
        expect(mockCertificationScoreRepo.updateAdditionalScore).not.toHaveBeenCalled();
        expect(result).toEqual(mockUpdated);
    });

    it('should clear the exam score override when null is provided', async () => {
        mockCertificationScoreRepo.findById.mockResolvedValue({ ...baseScore, examScoreOverride: 88 });
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
            examScoreOverride: 85,
        });

        const result = await manageCertificationScores.update('cert-1', {
            additionalScore: { class_speaking_score: 90 },
            examScoreOverride: 85,
        });

        expect(mockCertificationScoreRepo.updateAdditionalScore).toHaveBeenCalledWith('cert-1', { class_speaking_score: 90 });
        expect(mockCertificationScoreRepo.updateExamScoreOverride).toHaveBeenCalledWith('cert-1', 85);
        expect(result).toEqual({ ...baseScore, additionalScore: { class_speaking_score: 90 }, examScoreOverride: 85 });
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

        await expect(manageCertificationScores.update('missing', { examScoreOverride: 90 }))
            .rejects.toThrow('Certification score not found');
    });
});