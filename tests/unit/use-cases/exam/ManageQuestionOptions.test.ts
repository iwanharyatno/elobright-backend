import { ManageQuestionOptions } from '../../../../src/use-cases/exam/ManageQuestionOptions';
import { IQuestionOptionRepository } from '../../../../src/domain/repositories/IQuestionOptionRepository';
import { QuestionOption } from '../../../../src/domain/entities/QuestionOption';

describe('ManageQuestionOptions Use Case', () => {
    let manageQuestionOptions: ManageQuestionOptions;
    let mockOptionRepository: jest.Mocked<IQuestionOptionRepository>;

    beforeEach(() => {
        mockOptionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findByQuestionId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IQuestionOptionRepository>;

        manageQuestionOptions = new ManageQuestionOptions(mockOptionRepository);
    });

    it('should create a question option', async () => {
        const optionData = { questionId: 'q-1', optionText: 'Option A', isCorrect: true };
        const mockCreated = { id: 'opt-1', ...optionData } as unknown as QuestionOption;
        mockOptionRepository.create.mockResolvedValue(mockCreated);

        const result = await manageQuestionOptions.create(optionData);

        expect(mockOptionRepository.create).toHaveBeenCalledWith(optionData);
        expect(result).toEqual(mockCreated);
    });

    it('should get a question option by id', async () => {
        const mockOption = { id: 'opt-1', text: 'Option A' } as unknown as QuestionOption;
        mockOptionRepository.findById.mockResolvedValue(mockOption);

        const result = await manageQuestionOptions.getById('opt-1');

        expect(mockOptionRepository.findById).toHaveBeenCalledWith('opt-1');
        expect(result).toEqual(mockOption);
    });

    it('should get options by question id', async () => {
        const mockOptions = [{ id: 'opt-1', text: 'Option A' }] as unknown as QuestionOption[];
        mockOptionRepository.findByQuestionId.mockResolvedValue(mockOptions);

        const result = await manageQuestionOptions.getByQuestionId('q-1');

        expect(mockOptionRepository.findByQuestionId).toHaveBeenCalledWith('q-1');
        expect(result).toEqual(mockOptions);
    });

    it('should update a question option', async () => {
        const updateData = { isCorrect: false };
        const mockUpdated = { id: 'opt-1', ...updateData } as unknown as QuestionOption;
        mockOptionRepository.update.mockResolvedValue(mockUpdated);

        const result = await manageQuestionOptions.update('opt-1', updateData);

        expect(mockOptionRepository.update).toHaveBeenCalledWith('opt-1', updateData);
        expect(result).toEqual(mockUpdated);
    });

    it('should delete a question option', async () => {
        mockOptionRepository.delete.mockResolvedValue(true);

        const result = await manageQuestionOptions.delete('opt-1');

        expect(mockOptionRepository.delete).toHaveBeenCalledWith('opt-1');
        expect(result).toBe(true);
    });
});
