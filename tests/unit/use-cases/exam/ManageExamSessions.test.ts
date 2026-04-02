import { ManageExamSessions } from '../../../../src/use-cases/exam/ManageExamSessions';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { ExamSubmission } from '../../../../src/domain/entities/ExamSubmission';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';

describe('ManageExamSessions', () => {
    let mockRepositorySubmission: jest.Mocked<IExamSubmissionRepository>;
    let mockRepositoryExam: jest.Mocked<IExamRepository>;
    let useCase: ManageExamSessions;

    beforeEach(() => {
        mockRepositorySubmission = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            incrementTotalScore: jest.fn(),
            findByUserAndExam: jest.fn(),
        };
        mockRepositoryExam = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };
        useCase = new ManageExamSessions(mockRepositorySubmission, mockRepositoryExam);
    });

    describe('startExam', () => {
        it('should create an ongoing exam submission with calculated endTimeLimit', async () => {
            jest.useFakeTimers();
            const startedAt = new Date('2023-01-01T10:00:00Z');
            jest.setSystemTime(startedAt);

            const userId = 1;
            const examId = 'exam-123';
            
            mockRepositoryExam.findById.mockResolvedValue({
                id: examId,
                title: 'Test Exam',
                type: 'IELTS',
                durationMinutes: 90
            });

            mockRepositorySubmission.findByUserAndExam.mockResolvedValue([]);

            const expectedEndTimeLimit = new Date('2023-01-01T11:30:00Z'); // +90 minutes

            const expectedSubmission: ExamSubmission = {
                id: 'sub-1',
                userId,
                examId,
                status: 'ongoing',
                timezone: 'Asia/Jakarta',
                endTimeLimit: expectedEndTimeLimit,
                totalScore: 0,
                startedAt: startedAt,
                submittedAt: null
            };

            mockRepositorySubmission.create.mockResolvedValue(expectedSubmission);

            const result = await useCase.startExam(userId, examId, 'Asia/Jakarta');

            expect(result).toEqual(expectedSubmission);
            expect(mockRepositoryExam.findById).toHaveBeenCalledWith(examId);
            expect(mockRepositorySubmission.findByUserAndExam).toHaveBeenCalledWith(userId, examId);
            expect(mockRepositorySubmission.create).toHaveBeenCalledWith(expect.objectContaining({
                userId,
                examId,
                status: 'ongoing',
                totalScore: 0,
                timezone: 'Asia/Jakarta',
                startedAt: startedAt,
                endTimeLimit: expectedEndTimeLimit,
                submittedAt: null
            }));

            jest.useRealTimers();
        });

        it('should throw error if session already ongoing', async () => {
            const userId = 1;
            const examId = 'exam-123';
            
            mockRepositoryExam.findById.mockResolvedValue({
                id: examId,
                title: 'Test Exam',
                type: 'IELTS',
                durationMinutes: 90
            });

            mockRepositorySubmission.findByUserAndExam.mockResolvedValue([
                { id: 'sub-1', userId, examId, status: 'ongoing', totalScore: 0, timezone: null, startedAt: new Date(), endTimeLimit: null, submittedAt: null }
            ]);

            await expect(useCase.startExam(userId, examId)).rejects.toThrow('Ongoing session already exists');
        });
    });

    describe('finishExam', () => {
        it('should update submission status to submitted and set submittedAt', async () => {
            jest.useFakeTimers();
            const now = new Date('2023-01-01T11:00:00Z');
            jest.setSystemTime(now);

            const submissionId = 'sub-1';
            
            mockRepositorySubmission.findById.mockResolvedValue({
                id: submissionId,
                userId: 1,
                examId: 'exam-123',
                status: 'ongoing',
                totalScore: 10,
                timezone: 'Asia/Jakarta',
                endTimeLimit: new Date('2023-01-01T11:30:00Z'), // expires in 30m
                startedAt: new Date('2023-01-01T10:00:00Z'),
                submittedAt: null
            });

            const expectedSubmission: ExamSubmission = {
                id: submissionId,
                userId: 1,
                examId: 'exam-123',
                status: 'submitted',
                totalScore: 10,
                timezone: 'Asia/Jakarta',
                endTimeLimit: new Date('2023-01-01T11:30:00Z'),
                startedAt: new Date('2023-01-01T10:00:00Z'),
                submittedAt: now
            };

            mockRepositorySubmission.update.mockResolvedValue(expectedSubmission);

            const result = await useCase.finishExam(submissionId);

            expect(result).toEqual(expectedSubmission);
            expect(mockRepositorySubmission.update).toHaveBeenCalledWith(
                submissionId,
                expect.objectContaining({
                    status: 'submitted',
                    submittedAt: now
                })
            );

            jest.useRealTimers();
        });

        it('should throw error if time window is exceeded', async () => {
             jest.useFakeTimers();
            const now = new Date('2023-01-01T12:00:00Z');
            jest.setSystemTime(now);

            const submissionId = 'sub-1';
            
            mockRepositorySubmission.findById.mockResolvedValue({
                id: submissionId,
                userId: 1,
                examId: 'exam-123',
                status: 'ongoing',
                totalScore: 10,
                timezone: null,
                endTimeLimit: new Date('2023-01-01T11:30:00Z'), // expired 30 minutes ago
                startedAt: new Date('2023-01-01T10:00:00Z'),
                submittedAt: null
            });

            await expect(useCase.finishExam(submissionId)).rejects.toThrow('Time window exceeded');

            jest.useRealTimers();
        });

        it('should return null if submission not found', async () => {
            const submissionId = 'invalid-id';
            mockRepositorySubmission.findById.mockResolvedValue(null);

            const result = await useCase.finishExam(submissionId);

            expect(result).toBeNull();
        });
    });
});
