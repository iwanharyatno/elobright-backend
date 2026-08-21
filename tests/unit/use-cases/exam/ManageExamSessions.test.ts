import { ManageExamSessions } from '../../../../src/use-cases/exam/ManageExamSessions';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IUserAnswerRepository } from '../../../../src/domain/repositories/IUserAnswerRepository';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { ICertificationScoreRepository } from '../../../../src/domain/repositories/ICertificationScoreRepository';
import { ExamSectionSubmission } from '../../../../src/domain/entities/ExamSectionSubmission';
import { ExamSection } from '../../../../src/domain/entities/ExamSection';

describe('ManageExamSessions', () => {
    let mockSubmissionRepo: jest.Mocked<IExamSubmissionRepository>;
    let mockExamRepo: jest.Mocked<IExamRepository>;
    let mockUserAnswerRepo: jest.Mocked<IUserAnswerRepository>;
    let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
    let mockSectionSubmissionRepo: jest.Mocked<IExamSectionSubmissionRepository>;
    let mockSectionRepo: jest.Mocked<IExamSectionRepository>;
    let mockCertificationScoreRepo: jest.Mocked<ICertificationScoreRepository>;
    let useCase: ManageExamSessions;

    beforeEach(() => {
        mockSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findByUserAndExam: jest.fn(),
            findByUserId: jest.fn(),
            findAllWithDetails: jest.fn()
        } as unknown as jest.Mocked<IExamSubmissionRepository>;

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
            findBySectionSubmissionIds: jest.fn()
        } as unknown as jest.Mocked<IUserAnswerRepository>;

        mockQuestionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn(),
            findByIds: jest.fn(),
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

        mockCertificationScoreRepo = {
            createForSubmission: jest.fn(),
            findById: jest.fn(),
            findByExamSubmissionId: jest.fn(),
            findAll: jest.fn(),
            updateAdditionalScore: jest.fn(),
            updateExamScoreOverride: jest.fn()
        } as unknown as jest.Mocked<ICertificationScoreRepository>;

        useCase = new ManageExamSessions(
            mockSubmissionRepo,
            mockExamRepo,
            mockUserAnswerRepo,
            mockQuestionRepo,
            mockSectionSubmissionRepo,
            mockSectionRepo,
            mockCertificationScoreRepo
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

            mockSectionSubmissionRepo.findById.mockResolvedValue(currentSectionSubmission);
            mockSectionSubmissionRepo.update.mockResolvedValue({
                ...currentSectionSubmission,
                status: 'finished-late',
                submittedAt: now,
            });
            mockSectionRepo.findById.mockResolvedValue(currentSection);
            mockSectionRepo.findByExamId.mockResolvedValue([currentSection, nextSection]);
            mockSectionSubmissionRepo.findBySubmissionAndSection.mockResolvedValue([]);

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

            const result = await useCase.finishSection(sectionSubmissionId, 'Asia/Jakarta');

            expect(mockSectionSubmissionRepo.update).toHaveBeenCalledWith(
                sectionSubmissionId,
                expect.objectContaining({
                    status: 'finished-late',
                    timezone: 'Asia/Jakarta',
                    submittedAt: now,
                })
            );

            expect(result).not.toBeNull();
            expect(result!.id).toBe(nextSectionSubmissionId);
            expect(result!.examSectionId).toBe(nextSectionId);
            expect(result!.status).toBe('ongoing');

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
            mockSectionSubmissionRepo.findBySubmissionAndSection.mockResolvedValue([existingNextSubmission]);

            const result = await useCase.finishSection(sectionSubmissionId, 'Asia/Jakarta');

            expect(result).not.toBeNull();
            expect(result!.id).toBe(nextSectionSubmissionId);
            expect(result!.examSectionId).toBe(nextSectionId);
            expect(result!.status).toBe('ongoing');
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