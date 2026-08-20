import { ManageCertificationAdditionalScores } from '../../../../src/use-cases/certification/ManageCertificationAdditionalScores';
import { ICertificationAdditionalScoreRepository } from '../../../../src/domain/repositories/ICertificationAdditionalScoreRepository';
import { CertificationAdditionalScore } from '../../../../src/domain/entities/CertificationAdditionalScore';

describe('ManageCertificationAdditionalScores Use Case', () => {
    let manageCertificationAdditionalScores: ManageCertificationAdditionalScores;
    let mockRepository: jest.Mocked<ICertificationAdditionalScoreRepository>;

    beforeEach(() => {
        mockRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<ICertificationAdditionalScoreRepository>;

        manageCertificationAdditionalScores = new ManageCertificationAdditionalScores(mockRepository);
    });

    it('should create an additional score', async () => {
        const data = { scoreName: 'class_speaking_score', weight: 0.5 };
        const mockCreated = { id: 'score-1', ...data } as CertificationAdditionalScore;
        mockRepository.create.mockResolvedValue(mockCreated);

        const result = await manageCertificationAdditionalScores.create(data);

        expect(mockRepository.create).toHaveBeenCalledWith(data);
        expect(result).toEqual(mockCreated);
    });

    it('should get all additional scores', async () => {
        const mockScores = [
            { id: 'score-1', scoreName: 'class_speaking_score', weight: 0.5 },
            { id: 'score-2', scoreName: 'class_individual_task_score', weight: 0.5 },
        ] as CertificationAdditionalScore[];
        mockRepository.findAll.mockResolvedValue(mockScores);

        const result = await manageCertificationAdditionalScores.getAll();

        expect(mockRepository.findAll).toHaveBeenCalledWith();
        expect(result).toEqual(mockScores);
    });

    it('should get an additional score by id', async () => {
        const mockScore = { id: 'score-1', scoreName: 'class_speaking_score', weight: 0.5 } as CertificationAdditionalScore;
        mockRepository.findById.mockResolvedValue(mockScore);

        const result = await manageCertificationAdditionalScores.getById('score-1');

        expect(mockRepository.findById).toHaveBeenCalledWith('score-1');
        expect(result).toEqual(mockScore);
    });

    it('should update an additional score', async () => {
        const updateData = { weight: 0.75 };
        const mockUpdated = { id: 'score-1', scoreName: 'class_speaking_score', weight: 0.75 } as CertificationAdditionalScore;
        mockRepository.update.mockResolvedValue(mockUpdated);

        const result = await manageCertificationAdditionalScores.update('score-1', updateData);

        expect(mockRepository.update).toHaveBeenCalledWith('score-1', updateData);
        expect(result).toEqual(mockUpdated);
    });

    it('should delete an additional score', async () => {
        mockRepository.delete.mockResolvedValue(true);

        const result = await manageCertificationAdditionalScores.delete('score-1');

        expect(mockRepository.delete).toHaveBeenCalledWith('score-1');
        expect(result).toBe(true);
    });
});