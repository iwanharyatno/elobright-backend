import { ManageExamSessions } from '../../../../src/use-cases/exam/ManageExamSessions';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { ExamSubmission } from '../../../../src/domain/entities/ExamSubmission';

describe('ManageExamSessions', () => {
    let mockRepository: jest.Mocked<IExamSubmissionRepository>;
    let useCase: ManageExamSessions;

    beforeEach(() => {
        mockRepository = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            incrementTotalScore: jest.fn()
        };
        useCase = new ManageExamSessions(mockRepository);
    });

    describe('startExam', () => {
        it('should create an ongoing exam submission', async () => {
            const userId = 1;
            const examId = 'exam-123';

            const expectedSubmission: ExamSubmission = {
                id: 'sub-1',
                userId,
                examId,
                status: 'ongoing',
                totalScore: 0,
                startedAt: new Date('2023-01-01T10:00:00Z'),
                submittedAt: null
            };

            mockRepository.create.mockResolvedValue(expectedSubmission);

            const result = await useCase.startExam(userId, examId);

            expect(result).toEqual(expectedSubmission);
            expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
                userId,
                examId,
                status: 'ongoing',
                totalScore: 0,
                startedAt: expect.any(Date),
                submittedAt: null
            }));
        });
    });

    describe('finishExam', () => {
        it('should update submission status to submitted and set submittedAt', async () => {
            const submissionId = 'sub-1';

            const expectedSubmission: ExamSubmission = {
                id: submissionId,
                userId: 1,
                examId: 'exam-123',
                status: 'submitted',
                totalScore: 10,
                startedAt: new Date('2023-01-01T10:00:00Z'),
                submittedAt: new Date('2023-01-01T11:00:00Z')
            };

            mockRepository.update.mockResolvedValue(expectedSubmission);

            const result = await useCase.finishExam(submissionId);

            expect(result).toEqual(expectedSubmission);
            expect(mockRepository.update).toHaveBeenCalledWith(
                submissionId,
                expect.objectContaining({
                    status: 'submitted',
                    submittedAt: expect.any(Date)
                })
            );
        });

        it('should return null if submission not found', async () => {
            const submissionId = 'invalid-id';
            mockRepository.update.mockResolvedValue(null);

            const result = await useCase.finishExam(submissionId);

            expect(result).toBeNull();
            expect(mockRepository.update).toHaveBeenCalledWith(
                submissionId,
                expect.any(Object)
            );
        });
    });
});
