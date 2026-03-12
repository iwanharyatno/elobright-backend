import { RecordUserAnswer } from '../../../../src/use-cases/exam/RecordUserAnswer';
import { IUserAnswerRepository } from '../../../../src/domain/repositories/IUserAnswerRepository';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IQuestionOptionRepository } from '../../../../src/domain/repositories/IQuestionOptionRepository';
import { UserAnswer } from '../../../../src/domain/entities/UserAnswer';

describe('RecordUserAnswer', () => {
    let mockUserAnswerRepository: jest.Mocked<IUserAnswerRepository>;
    let mockSubmissionRepository: jest.Mocked<IExamSubmissionRepository>;
    let mockExamRepository: jest.Mocked<IExamRepository>;
    let mockOptionRepository: jest.Mocked<IQuestionOptionRepository>;
    let useCase: RecordUserAnswer;

    beforeEach(() => {
        mockUserAnswerRepository = { create: jest.fn() };
        mockSubmissionRepository = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            incrementTotalScore: jest.fn()
        };
        mockExamRepository = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn()
        };
        mockOptionRepository = {
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findById: jest.fn(),
            findByQuestionId: jest.fn()
        };

        useCase = new RecordUserAnswer(
            mockUserAnswerRepository,
            mockSubmissionRepository,
            mockExamRepository,
            mockOptionRepository
        );
    });

    it('should throw an error if submission is not ongoing', async () => {
        mockSubmissionRepository.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'submitted', totalScore: 0, startedAt: new Date(), submittedAt: new Date()
        });

        await expect(useCase.execute('sub-1', 'q-1')).rejects.toThrow('Exam is not currently ongoing');
    });

    it('should throw an error if time window is exceeded', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T12:00:00Z');
        jest.setSystemTime(mockNow);

        const startedAt = new Date('2023-01-01T10:00:00Z');
        mockSubmissionRepository.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'ongoing', totalScore: 0, startedAt, submittedAt: null
        });

        mockExamRepository.findById.mockResolvedValue({
            id: 'exam-1', title: 'Test Exam', type: 'IELTS', durationMinutes: 60
        });

        await expect(useCase.execute('sub-1', 'q-1')).rejects.toThrow('Time window exceeded');

        jest.useRealTimers();
    });

    it('should increment score if MCQ answer is correct', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T10:30:00Z'); // Within 60min window
        jest.setSystemTime(mockNow);

        mockSubmissionRepository.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'ongoing', totalScore: 0, startedAt: new Date('2023-01-01T10:00:00Z'), submittedAt: null
        });
        mockExamRepository.findById.mockResolvedValue({
            id: 'exam-1', title: 'Test Exam', type: 'IELTS', durationMinutes: 60
        });
        mockOptionRepository.findById.mockResolvedValue({
            id: 'opt-1', questionId: 'q-1', optionText: 'Correct Option', isCorrect: true
        });

        const expectedAnswer: UserAnswer = {
            id: 'ans-1', submissionId: 'sub-1', questionId: 'q-1', selectedOptionId: 'opt-1', textResponse: null, audioResponseUrl: null
        };
        mockUserAnswerRepository.create.mockResolvedValue(expectedAnswer);

        const result = await useCase.execute('sub-1', 'q-1', 'opt-1');

        expect(mockOptionRepository.findById).toHaveBeenCalledWith('opt-1');
        expect(mockSubmissionRepository.incrementTotalScore).toHaveBeenCalledWith('sub-1', 1);
        expect(mockUserAnswerRepository.create).toHaveBeenCalled();
        expect(result).toEqual(expectedAnswer);

        jest.restoreAllMocks();
    });

    it('should create generic answer record successfully', async () => {
        jest.useFakeTimers();
        const mockNow = new Date('2023-01-01T10:30:00Z'); // Within 60min window
        jest.setSystemTime(mockNow);

        mockSubmissionRepository.findById.mockResolvedValue({
            id: 'sub-1', userId: 1, examId: 'exam-1', status: 'ongoing', totalScore: 0, startedAt: new Date('2023-01-01T10:00:00Z'), submittedAt: null
        });
        mockExamRepository.findById.mockResolvedValue({
            id: 'exam-1', title: 'Test Exam', type: 'IELTS', durationMinutes: 60
        });

        const expectedAnswer: UserAnswer = {
            id: 'ans-1', submissionId: 'sub-1', questionId: 'q-1', selectedOptionId: null, textResponse: 'text response', audioResponseUrl: null
        };
        mockUserAnswerRepository.create.mockResolvedValue(expectedAnswer);

        const result = await useCase.execute('sub-1', 'q-1', undefined, 'text response');

        expect(mockSubmissionRepository.incrementTotalScore).not.toHaveBeenCalled();
        expect(mockUserAnswerRepository.create).toHaveBeenCalledWith({
            submissionId: 'sub-1',
            questionId: 'q-1',
            selectedOptionId: null,
            textResponse: 'text response',
            audioResponseUrl: null
        });
        expect(result).toEqual(expectedAnswer);

        jest.useRealTimers();
    });
});
