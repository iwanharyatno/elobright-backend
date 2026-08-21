import { RecordUserAnswer } from '../../../../src/use-cases/exam/RecordUserAnswer';
import { IUserAnswerRepository } from '../../../../src/domain/repositories/IUserAnswerRepository';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IQuestionOptionRepository } from '../../../../src/domain/repositories/IQuestionOptionRepository';
import { UserAnswer } from '../../../../src/domain/entities/UserAnswer';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';

describe('RecordUserAnswer', () => {
    let mockUserAnswerRepository: jest.Mocked<IUserAnswerRepository>;
    let mockSubmissionRepository: jest.Mocked<IExamSubmissionRepository>;
    let mockExamRepository: jest.Mocked<IExamRepository>;
    let mockOptionRepository: jest.Mocked<IQuestionOptionRepository>;
    let mockQuestionRepository: jest.Mocked<IQuestionRepository>;
    let mockSectionSubmissionRepository: jest.Mocked<IExamSectionSubmissionRepository>;
    let useCase: RecordUserAnswer;

    beforeEach(() => {
        mockUserAnswerRepository = {
            create: jest.fn(),
            update: jest.fn(),
            findBySectionSubmissionAndQuestion: jest.fn(),
            findBySectionSubmissionId: jest.fn(),
            findBySectionSubmissionIds: jest.fn()
        } as unknown as jest.Mocked<IUserAnswerRepository>;

        mockSubmissionRepository = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findByUserAndExam: jest.fn(),
            findByUserId: jest.fn(),
            findAllWithDetails: jest.fn()
        } as unknown as jest.Mocked<IExamSubmissionRepository>;

        mockExamRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IExamRepository>;

        mockOptionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findByQuestionId: jest.fn(),
            findByQuestionIds: jest.fn(),
            findByIds: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IQuestionOptionRepository>;

        mockQuestionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn(),
            findByIds: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn()
        } as unknown as jest.Mocked<IQuestionRepository>;

        mockSectionSubmissionRepository = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findBySubmissionId: jest.fn(),
            findBySubmissionAndSection: jest.fn(),
            findLatestBySubmissionId: jest.fn(),
            incrementTotalScore: jest.fn()
        } as unknown as jest.Mocked<IExamSectionSubmissionRepository>;

        mockQuestionRepository.findById.mockResolvedValue({
            id: 'q-1', sectionId: 'sec-1', questionText: 'Q1', points: 1,
            audioUrl: null, questionAudioUrl: null, imageUrl: null, narrativeText: null,
            questionType: 'mcq', orderIndex: null, isActive: true
        });

        // Default mock for section submission - tests can override
        mockSectionSubmissionRepository.findById.mockResolvedValue({
            id: 'sec-sub-1', submissionId: 'sub-1', examSectionId: 'sec-1',
            status: 'ongoing', totalScore: 0, timezone: 'Asia/Jakarta',
            startedAt: new Date('2023-01-01T10:00:00Z'),
            endTimeLimit: new Date('2023-01-01T11:00:00Z'),
            submittedAt: null
        });

        useCase = new RecordUserAnswer(
            mockUserAnswerRepository,
            mockSectionSubmissionRepository,
            mockOptionRepository,
            mockQuestionRepository
        );
    });

    it('should throw an error if submission is not ongoing', async () => {
        mockSectionSubmissionRepository.findById.mockResolvedValue({
            id: 'sec-sub-1', submissionId: 'sub-1', examSectionId: 'sec-1',
            status: 'submitted', totalScore: 0, timezone: 'Asia/Jakarta',
            startedAt: new Date('2023-01-01T10:00:00Z'),
            endTimeLimit: new Date('2023-01-01T11:00:00Z'),
            submittedAt: new Date('2023-01-01T11:00:00Z')
        });

        await expect(useCase.execute('sec-sub-1', 'q-1')).rejects.toThrow('Section is not currently ongoing');
    });

    it('should throw an error if question is not found', async () => {
        mockQuestionRepository.findById.mockResolvedValue(null);

        await expect(useCase.execute('sec-sub-1', 'q-99')).rejects.toThrow('Question not found');
    });

    it('should throw an error if time window is exceeded', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T12:00:00Z');
        jest.setSystemTime(mockNow);

        mockSectionSubmissionRepository.findById.mockResolvedValue({
            id: 'sec-sub-1', submissionId: 'sub-1', examSectionId: 'sec-1',
            status: 'ongoing', totalScore: 0, timezone: 'Asia/Jakarta',
            startedAt: new Date('2023-01-01T10:00:00Z'),
            endTimeLimit: new Date('2023-01-01T11:00:00Z'),
            submittedAt: null
        });

        await expect(useCase.execute('sec-sub-1', 'q-1')).rejects.toThrow('Time window exceeded');

        jest.useRealTimers();
    });

    it('should increment score using the question points if MCQ answer is correct', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T10:30:00Z');
        jest.setSystemTime(mockNow);

        mockQuestionRepository.findById.mockResolvedValue({
            id: 'q-1', sectionId: 'sec-1', questionText: 'Q1', points: 3,
            audioUrl: null, questionAudioUrl: null, imageUrl: null, narrativeText: null,
            questionType: 'mcq', orderIndex: null, isActive: true
        });
        mockOptionRepository.findById.mockResolvedValue({
            id: 'opt-1', questionId: 'q-1', optionText: 'Correct Option', isCorrect: true
        });

        const expectedAnswer: UserAnswer = {
            id: 'ans-1', sectionSubmissionId: 'sec-sub-1', questionId: 'q-1',
            selectedOptionId: 'opt-1', textResponse: null, audioResponseUrl: null
        };
        mockUserAnswerRepository.create.mockResolvedValue(expectedAnswer);

        const result = await useCase.execute('sec-sub-1', 'q-1', 'opt-1');

        expect(mockQuestionRepository.findById).toHaveBeenCalledWith('q-1');
        expect(mockOptionRepository.findById).toHaveBeenCalledWith('opt-1');
        expect(mockUserAnswerRepository.create).toHaveBeenCalled();
        expect(result).toEqual(expectedAnswer);

        jest.restoreAllMocks();
    });

    it('should create generic answer record successfully', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T10:30:00Z');
        jest.setSystemTime(mockNow);

        const expectedAnswer: UserAnswer = {
            id: 'ans-1', sectionSubmissionId: 'sec-sub-1', questionId: 'q-1',
            selectedOptionId: null, textResponse: 'text response', audioResponseUrl: null
        };
        mockUserAnswerRepository.create.mockResolvedValue(expectedAnswer);

        const result = await useCase.execute('sec-sub-1', 'q-1', undefined, 'text response');

        expect(mockUserAnswerRepository.create).toHaveBeenCalledWith({
            sectionSubmissionId: 'sec-sub-1',
            questionId: 'q-1',
            selectedOptionId: null,
            textResponse: 'text response',
            audioResponseUrl: null
        });
        expect(result).toEqual(expectedAnswer);

        jest.useRealTimers();
    });

    it('should correctly increment/decrement totalScore through multiple choice selections (upsert flow)', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2023-01-01T10:30:00Z'));

        mockQuestionRepository.findById.mockResolvedValue({
            id: 'q-1', sectionId: 'sec-1', questionText: 'Q1', points: 2,
            audioUrl: null, questionAudioUrl: null, imageUrl: null, narrativeText: null,
            questionType: 'mcq', orderIndex: null, isActive: true
        });

        mockOptionRepository.findById.mockImplementation(async (id: string) => {
            if (id === 'opt-correct') return { id: 'opt-correct', questionId: 'q-1', optionText: 'C', isCorrect: true };
            if (id === 'opt-wrong') return { id: 'opt-wrong', questionId: 'q-1', optionText: 'W', isCorrect: false };
            return null;
        });

        let currentExistingAnswer: any = null;
        mockUserAnswerRepository.findBySectionSubmissionAndQuestion.mockImplementation(async () => currentExistingAnswer);
        mockUserAnswerRepository.create.mockImplementation(async (data: any) => {
            currentExistingAnswer = { id: 'ans-1', ...data };
            return currentExistingAnswer;
        });
        mockUserAnswerRepository.update.mockImplementation(async (id: string, data: any) => {
            currentExistingAnswer = { ...currentExistingAnswer, ...data };
            return currentExistingAnswer;
        });

        // 1. User select wrong first answer
        currentExistingAnswer = null;
        await useCase.execute('sec-sub-1', 'q-1', 'opt-wrong');
        mockSectionSubmissionRepository.incrementTotalScore.mockClear();

        // 2. Correct second answer (wrong -> correct) -> should +2
        await useCase.execute('sec-sub-1', 'q-1', 'opt-correct');
        expect(mockSectionSubmissionRepository.incrementTotalScore).toHaveBeenLastCalledWith('sec-sub-1', 2);
        mockSectionSubmissionRepository.incrementTotalScore.mockClear();

        // 3. Wrong again (correct -> wrong) -> should -2
        await useCase.execute('sec-sub-1', 'q-1', 'opt-wrong');
        expect(mockSectionSubmissionRepository.incrementTotalScore).toHaveBeenLastCalledWith('sec-sub-1', -2);
        mockSectionSubmissionRepository.incrementTotalScore.mockClear();

        // 4. Wrong again (wrong -> wrong) -> should not be called
        await useCase.execute('sec-sub-1', 'q-1', 'opt-wrong');
        expect(mockSectionSubmissionRepository.incrementTotalScore).not.toHaveBeenCalled();
        mockSectionSubmissionRepository.incrementTotalScore.mockClear();

        // 5. Correct then (wrong -> correct) -> should +2
        await useCase.execute('sec-sub-1', 'q-1', 'opt-correct');
        expect(mockSectionSubmissionRepository.incrementTotalScore).toHaveBeenLastCalledWith('sec-sub-1', 2);
        mockSectionSubmissionRepository.incrementTotalScore.mockClear();

        // 6. Correct again (correct -> correct) -> should not be called
        await useCase.execute('sec-sub-1', 'q-1', 'opt-correct');
        expect(mockSectionSubmissionRepository.incrementTotalScore).not.toHaveBeenCalled();

        jest.useRealTimers();
    });
});