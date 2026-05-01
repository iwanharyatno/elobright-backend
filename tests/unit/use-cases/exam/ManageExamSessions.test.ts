import { ManageExamSessions } from '../../../../src/use-cases/exam/ManageExamSessions';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IUserAnswerRepository } from '../../../../src/domain/repositories/IUserAnswerRepository';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { ExamSectionSubmission } from '../../../../src/domain/entities/ExamSectionSubmission';
import { ExamSection } from '../../../../src/domain/entities/ExamSection';

describe('ManageExamSessions', () => {
    let mockSubmissionRepo: jest.Mocked<IExamSubmissionRepository>;
    let mockExamRepo: jest.Mocked<IExamRepository>;
    let mockUserAnswerRepo: jest.Mocked<IUserAnswerRepository>;
    let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
    let mockSectionSubmissionRepo: jest.Mocked<IExamSectionSubmissionRepository>;
    let mockSectionRepo: jest.Mocked<IExamSectionRepository>;
    let useCase: ManageExamSessions;

    beforeEach(() => {
        mockSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findByUserAndExam: jest.fn(),
            findByUserId: jest.fn(),
        };
        mockExamRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };
        mockUserAnswerRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findBySectionSubmissionAndQuestion: jest.fn(),
            findBySectionSubmissionId: jest.fn(),
        };
        mockQuestionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn(),
        };
        mockSectionSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findBySubmissionId: jest.fn(),
            findBySubmissionAndSection: jest.fn(),
            findLatestBySubmissionId: jest.fn(),
            incrementTotalScore: jest.fn(),
        };
        mockSectionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByExamId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn(),
        };

        useCase = new ManageExamSessions(
            mockSubmissionRepo,
            mockExamRepo,
            mockUserAnswerRepo,
            mockQuestionRepo,
            mockSectionSubmissionRepo,
            mockSectionRepo
        );
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('finishSection', () => {
        const examId = 'exam-001';
        const submissionId = 'sub-001';
        const currentSectionId = 'section-001';
        const nextSectionId = 'section-002';
        const sectionSubmissionId = 'sec-sub-001';
        const nextSectionSubmissionId = 'sec-sub-002';

        const currentSection: ExamSection = {
            id: currentSectionId,
            examId,
            title: 'Listening',
            instructions: null,
            orderIndex: 0,
            durationMinutes: 30,
        };

        const nextSection: ExamSection = {
            id: nextSectionId,
            examId,
            title: 'Reading',
            instructions: null,
            orderIndex: 1,
            durationMinutes: 60,
        };

        it('should finish a late section submission and create the next section submission', async () => {
            jest.useFakeTimers();
            // endTimeLimit was 10:30, but current time is 11:00 (30 min late)
            const endTimeLimit = new Date('2023-01-01T10:30:00Z');
            const now = new Date('2023-01-01T11:00:00Z');
            jest.setSystemTime(now);

            const currentSectionSubmission: ExamSectionSubmission = {
                id: sectionSubmissionId,
                submissionId,
                examSectionId: currentSectionId,
                status: 'ongoing',
                totalScore: 5,
                timezone: 'Asia/Jakarta',
                startedAt: new Date('2023-01-01T10:00:00Z'),
                endTimeLimit,
                submittedAt: null,
            };

            // Mock: findById returns the current (expired) section submission
            mockSectionSubmissionRepo.findById.mockResolvedValue(currentSectionSubmission);

            // Mock: update finishes the section with 'finished-late'
            mockSectionSubmissionRepo.update.mockResolvedValue({
                ...currentSectionSubmission,
                status: 'finished-late',
                submittedAt: now,
            });

            // Mock: findById for the current ExamSection
            mockSectionRepo.findById.mockResolvedValue(currentSection);

            // Mock: findByExamId returns both sections ordered by orderIndex
            mockSectionRepo.findByExamId.mockResolvedValue([currentSection, nextSection]);

            // Mock: no existing submission for the next section (idempotency check)
            mockSectionSubmissionRepo.findBySubmissionAndSection.mockResolvedValue([]);

            // Mock: create returns the newly created next section submission
            const createdNextSubmission: ExamSectionSubmission = {
                id: nextSectionSubmissionId,
                submissionId,
                examSectionId: nextSectionId,
                status: 'ongoing',
                totalScore: 0,
                timezone: 'Asia/Jakarta',
                startedAt: now,
                endTimeLimit: new Date(now.getTime() + nextSection.durationMinutes * 60000),
                submittedAt: null,
            };
            mockSectionSubmissionRepo.create.mockResolvedValue(createdNextSubmission);

            // Execute
            const result = await useCase.finishSection(sectionSubmissionId, 'Asia/Jakarta');

            // Assertions
            // 1. The current section should be updated with 'finished-late'
            expect(mockSectionSubmissionRepo.update).toHaveBeenCalledWith(
                sectionSubmissionId,
                expect.objectContaining({
                    status: 'finished-late',
                    timezone: 'Asia/Jakarta',
                    submittedAt: now,
                })
            );

            // 2. Should return the next section submission
            expect(result).not.toBeNull();
            expect(result!.id).toBe(nextSectionSubmissionId);
            expect(result!.examSectionId).toBe(nextSectionId);
            expect(result!.status).toBe('ongoing');

            // 3. The next section was created with correct data
            expect(mockSectionSubmissionRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    submissionId,
                    examSectionId: nextSectionId,
                    status: 'ongoing',
                    totalScore: 0,
                    timezone: 'Asia/Jakarta',
                })
            );
        });

        it('should return existing next section submission if already created (idempotency)', async () => {
            jest.useFakeTimers();
            const now = new Date('2023-01-01T11:00:00Z');
            jest.setSystemTime(now);

            const currentSectionSubmission: ExamSectionSubmission = {
                id: sectionSubmissionId,
                submissionId,
                examSectionId: currentSectionId,
                status: 'ongoing',
                totalScore: 5,
                timezone: 'Asia/Jakarta',
                startedAt: new Date('2023-01-01T10:00:00Z'),
                endTimeLimit: new Date('2023-01-01T10:30:00Z'),
                submittedAt: null,
            };

            const existingNextSubmission: ExamSectionSubmission = {
                id: nextSectionSubmissionId,
                submissionId,
                examSectionId: nextSectionId,
                status: 'ongoing',
                totalScore: 0,
                timezone: 'Asia/Jakarta',
                startedAt: new Date('2023-01-01T10:31:00Z'),
                endTimeLimit: new Date('2023-01-01T11:31:00Z'),
                submittedAt: null,
            };

            mockSectionSubmissionRepo.findById.mockResolvedValue(currentSectionSubmission);
            mockSectionSubmissionRepo.update.mockResolvedValue({ ...currentSectionSubmission, status: 'finished-late', submittedAt: now });
            mockSectionRepo.findById.mockResolvedValue(currentSection);
            mockSectionRepo.findByExamId.mockResolvedValue([currentSection, nextSection]);

            // Already exists — idempotency path
            mockSectionSubmissionRepo.findBySubmissionAndSection.mockResolvedValue([existingNextSubmission]);

            const result = await useCase.finishSection(sectionSubmissionId, 'Asia/Jakarta');

            // Should return existing record
            expect(result).not.toBeNull();
            expect(result!.id).toBe(nextSectionSubmissionId);
            expect(result!.examSectionId).toBe(nextSectionId);
            expect(result!.status).toBe('ongoing');

            // create should NOT have been called
            expect(mockSectionSubmissionRepo.create).not.toHaveBeenCalled();
        });

        it('should return null when there is no next section', async () => {
            jest.useFakeTimers();
            const now = new Date('2023-01-01T10:20:00Z');
            jest.setSystemTime(now);

            const currentSectionSubmission: ExamSectionSubmission = {
                id: sectionSubmissionId,
                submissionId,
                examSectionId: currentSectionId,
                status: 'ongoing',
                totalScore: 5,
                timezone: null,
                startedAt: new Date('2023-01-01T10:00:00Z'),
                endTimeLimit: new Date('2023-01-01T10:30:00Z'),
                submittedAt: null,
            };

            mockSectionSubmissionRepo.findById.mockResolvedValue(currentSectionSubmission);
            mockSectionSubmissionRepo.update.mockResolvedValue({ ...currentSectionSubmission, status: 'finished', submittedAt: now });
            mockSectionRepo.findById.mockResolvedValue(currentSection);

            // Only one section in the exam — no next
            mockSectionRepo.findByExamId.mockResolvedValue([currentSection]);

            const result = await useCase.finishSection(sectionSubmissionId);

            expect(result).toBeNull();
            expect(mockSectionSubmissionRepo.create).not.toHaveBeenCalled();
        });

        it('should throw error if section submission not found', async () => {
            mockSectionSubmissionRepo.findById.mockResolvedValue(null);

            await expect(useCase.finishSection('nonexistent-id'))
                .rejects.toThrow('Exam section session not found');
        });

        it('should set finished (not finished-late) when submitted within time', async () => {
            jest.useFakeTimers();
            const now = new Date('2023-01-01T10:20:00Z'); // within limit
            jest.setSystemTime(now);

            const currentSectionSubmission: ExamSectionSubmission = {
                id: sectionSubmissionId,
                submissionId,
                examSectionId: currentSectionId,
                status: 'ongoing',
                totalScore: 5,
                timezone: null,
                startedAt: new Date('2023-01-01T10:00:00Z'),
                endTimeLimit: new Date('2023-01-01T10:30:00Z'),
                submittedAt: null,
            };

            mockSectionSubmissionRepo.findById.mockResolvedValue(currentSectionSubmission);
            mockSectionSubmissionRepo.update.mockResolvedValue({ ...currentSectionSubmission, status: 'finished', submittedAt: now });
            mockSectionRepo.findById.mockResolvedValue(currentSection);
            mockSectionRepo.findByExamId.mockResolvedValue([currentSection]);

            await useCase.finishSection(sectionSubmissionId);

            expect(mockSectionSubmissionRepo.update).toHaveBeenCalledWith(
                sectionSubmissionId,
                expect.objectContaining({
                    status: 'finished',
                    submittedAt: now,
                })
            );
        });
    });
});
