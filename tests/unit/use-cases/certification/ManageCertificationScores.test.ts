import { ManageCertificationScores } from '../../../../src/use-cases/certification/ManageCertificationScores';
import { ICertificationScoreRepository } from '../../../../src/domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../../../src/domain/repositories/ICertificationAdditionalScoreRepository';
import { CertificationScore } from '../../../../src/domain/entities/CertificationScore';

describe('ManageCertificationScores Use Case', () => {
    let manageCertificationScores: ManageCertificationScores;
    let mockCertificationScoreRepo: jest.Mocked<ICertificationScoreRepository>;
    let mockAdditionalScoreRepo: jest.Mocked<ICertificationAdditionalScoreRepository>;

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

        manageCertificationScores = new ManageCertificationScores(mockCertificationScoreRepo, mockAdditionalScoreRepo);
    });

    it('should get all certification scores', async () => {
        mockCertificationScoreRepo.findAll.mockResolvedValue([baseScore]);

        const result = await manageCertificationScores.getAll();

        expect(mockCertificationScoreRepo.findAll).toHaveBeenCalledWith();
        expect(result).toEqual([baseScore]);
    });

    it('should filter certification scores by exam submission id', async () => {
        mockCertificationScoreRepo.findByExamSubmissionId.mockResolvedValue(baseScore);

        const result = await manageCertificationScores.getAll('sub-1');

        expect(mockCertificationScoreRepo.findByExamSubmissionId).toHaveBeenCalledWith('sub-1');
        expect(result).toEqual([baseScore]);
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