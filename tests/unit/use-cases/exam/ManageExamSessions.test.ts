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

    describe('startExam with one-attempt exams', () => {
        const userId = 1;
        const examId = 'exam-once';

        const baseSection: ExamSection = {
            id: 'section-001',
            examId,
            title: 'Reading',
            instructions: null,
            orderIndex: 0,
            durationMinutes: 30,
        };

        const setupHappyPath = () => {
            const now = new Date('2023-01-01T10:00:00Z');
            mockSubmissionRepo.create.mockResolvedValue({
                id: 'sub-new',
                userId,
                examId,
                status: 'ongoing',
                timezone: null,
                startedAt: now,
                submittedAt: null,
            });
            mockSectionRepo.findByExamId.mockResolvedValue([baseSection]);
            mockSectionSubmissionRepo.create.mockResolvedValue({
                id: 'sec-sub-new',
                submissionId: 'sub-new',
                examSectionId: baseSection.id,
                status: 'ongoing',
                totalScore: 0,
                timezone: null,
                startedAt: now,
                endTimeLimit: new Date(now.getTime() + baseSection.durationMinutes * 60000),
                submittedAt: null,
            });
        };

        it('should forbid starting when the once-only exam was already attempted', async () => {
            mockExamRepo.findById.mockResolvedValue({
                id: examId, title: 'Certification', type: 'TOEFL', isOnce: true
            });
            mockSubmissionRepo.findByUserAndExam.mockResolvedValue([
                { id: 'sub-old', userId, examId, status: 'submitted', timezone: null, startedAt: new Date(), submittedAt: new Date() }
            ]);

            await expect(useCase.startExam(userId, examId)).rejects.toThrow('Exam can only be taken once');
            expect(mockSubmissionRepo.create).not.toHaveBeenCalled();
        });

        it('should count finished-late attempts as prior attempts on once-only exams', async () => {
            mockExamRepo.findById.mockResolvedValue({
                id: examId, title: 'Certification', type: 'TOEFL', isOnce: true
            });
            mockSubmissionRepo.findByUserAndExam.mockResolvedValue([
                { id: 'sub-old', userId, examId, status: 'finished-late', timezone: null, startedAt: new Date(), submittedAt: new Date() }
            ]);

            await expect(useCase.startExam(userId, examId)).rejects.toThrow('Exam can only be taken once');
            expect(mockSubmissionRepo.create).not.toHaveBeenCalled();
        });

        it('should allow starting when the once-only exam has no prior attempts', async () => {
            mockExamRepo.findById.mockResolvedValue({
                id: examId, title: 'Certification', type: 'TOEFL', isOnce: true
            });
            mockSubmissionRepo.findByUserAndExam.mockResolvedValue([]);
            setupHappyPath();

            const result = await useCase.startExam(userId, examId);

            expect(mockSubmissionRepo.create).toHaveBeenCalled();
            expect(result.currentSectionSession.examSectionId).toBe(baseSection.id);
        });

        it('should still allow resuming an ongoing session on a once-only exam', async () => {
            jest.useFakeTimers();
            const now = new Date('2023-01-01T11:00:00Z');
            jest.setSystemTime(now);

            mockExamRepo.findById.mockResolvedValue({
                id: examId, title: 'Certification', type: 'TOEFL', isOnce: true
            });
            const ongoing = { id: 'sub-live', userId, examId, status: 'ongoing' as const, timezone: null, startedAt: now, submittedAt: null };
            mockSubmissionRepo.findByUserAndExam.mockResolvedValue([
                ongoing,
                { id: 'sub-old', userId, examId, status: 'submitted', timezone: null, startedAt: new Date(), submittedAt: new Date() }
            ]);
            mockSectionSubmissionRepo.findLatestBySubmissionId.mockResolvedValue({
                id: 'sec-sub-live',
                submissionId: 'sub-live',
                examSectionId: baseSection.id,
                status: 'ongoing',
                totalScore: 0,
                timezone: null,
                startedAt: now,
                endTimeLimit: new Date(now.getTime() + baseSection.durationMinutes * 60000),
                submittedAt: null,
            });
            mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([]);

            const error = await useCase.startExam(userId, examId).catch(e => e) as any;

            expect(error.message).toBe('Ongoing session already exists');
            expect(error.session.id).toBe('sub-live');
            expect(mockSubmissionRepo.create).not.toHaveBeenCalled();
        });

        it('should allow re-attempts when the exam is not once-only', async () => {
            mockExamRepo.findById.mockResolvedValue({
                id: examId, title: 'Practice', type: 'TOEFL', isOnce: false
            });
            mockSubmissionRepo.findByUserAndExam.mockResolvedValue([
                { id: 'sub-old', userId, examId, status: 'submitted', timezone: null, startedAt: new Date(), submittedAt: new Date() }
            ]);
            setupHappyPath();

            const result = await useCase.startExam(userId, examId);

            expect(mockSubmissionRepo.create).toHaveBeenCalled();
            expect(result.currentSectionSession.examSectionId).toBe(baseSection.id);
        });
    });
});