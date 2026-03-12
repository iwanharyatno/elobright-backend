import { ManageQuestions } from '../../../../src/use-cases/exam/ManageQuestions';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { Question } from '../../../../src/domain/entities/Question';

describe('ManageQuestions Use Case', () => {
    let manageQuestions: ManageQuestions;
    let mockQuestionRepository: jest.Mocked<IQuestionRepository>;

    beforeEach(() => {
        mockQuestionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IQuestionRepository>;

        manageQuestions = new ManageQuestions(mockQuestionRepository);
    });

    const createMockFile = (filename: string): Express.Multer.File => {
        return { filename } as Express.Multer.File;
    };

    it('should create a question without files', async () => {
        const questionData: Omit<Question, 'id'> = { sectionId: 'section-1', questionText: 'Q1', questionType: 'single_choice', audioUrl: null, imageUrl: null, narrativeText: null, points: null };
        const mockCreated = { id: 'q-1', ...questionData } as unknown as Question;
        mockQuestionRepository.create.mockResolvedValue(mockCreated);

        const result = await manageQuestions.create(questionData);

        expect(mockQuestionRepository.create).toHaveBeenCalledWith(questionData);
        expect(result).toEqual(mockCreated);
    });

    it('should create a question with files', async () => {
        const questionData: Omit<Question, 'id'> = { sectionId: 'section-1', questionText: 'Q1', questionType: 'single_choice', audioUrl: null, imageUrl: null, narrativeText: null, points: null };
        const audioFile = createMockFile('audio.mp3');
        const imageFile = createMockFile('image.png');

        const expectedData = {
            ...questionData,
            audioUrl: '/uploads/audio.mp3',
            imageUrl: '/uploads/image.png'
        };
        const mockCreated = { id: 'q-1', ...expectedData } as unknown as Question;
        mockQuestionRepository.create.mockResolvedValue(mockCreated);

        const result = await manageQuestions.create(questionData, audioFile, imageFile);

        expect(mockQuestionRepository.create).toHaveBeenCalledWith(expectedData);
        expect(result).toEqual(mockCreated);
    });

    it('should get a question by id', async () => {
        const mockQuestion = { id: 'q-1', questionText: 'Q1' } as unknown as Question;
        mockQuestionRepository.findById.mockResolvedValue(mockQuestion);

        const result = await manageQuestions.getById('q-1');

        expect(mockQuestionRepository.findById).toHaveBeenCalledWith('q-1');
        expect(result).toEqual(mockQuestion);
    });

    it('should get questions by section id', async () => {
        const mockQuestions = [{ id: 'q-1', questionText: 'Q1' }] as unknown as Question[];
        mockQuestionRepository.findBySectionId.mockResolvedValue(mockQuestions);

        const result = await manageQuestions.getBySectionId('section-1');

        expect(mockQuestionRepository.findBySectionId).toHaveBeenCalledWith('section-1');
        expect(result).toEqual(mockQuestions);
    });

    it('should update a question', async () => {
        const updateData = { questionText: 'Updated Q1' };
        const mockUpdated = { id: 'q-1', ...updateData } as unknown as Question;
        mockQuestionRepository.update.mockResolvedValue(mockUpdated);

        const result = await manageQuestions.update('q-1', updateData);

        expect(mockQuestionRepository.update).toHaveBeenCalledWith('q-1', updateData);
        expect(result).toEqual(mockUpdated);
    });

    it('should update a question with files', async () => {
        const updateData = { questionText: 'Updated Q1' };
        const audioFile = createMockFile('new-audio.mp3');
        const expectedData = { ...updateData, audioUrl: '/uploads/new-audio.mp3' };

        const mockUpdated = { id: 'q-1', ...expectedData } as unknown as Question;
        mockQuestionRepository.update.mockResolvedValue(mockUpdated);

        const result = await manageQuestions.update('q-1', updateData, audioFile, undefined);

        expect(mockQuestionRepository.update).toHaveBeenCalledWith('q-1', expectedData);
        expect(result).toEqual(mockUpdated);
    });

    it('should delete a question', async () => {
        mockQuestionRepository.delete.mockResolvedValue(true);

        const result = await manageQuestions.delete('q-1');

        expect(mockQuestionRepository.delete).toHaveBeenCalledWith('q-1');
        expect(result).toBe(true);
    });
});
