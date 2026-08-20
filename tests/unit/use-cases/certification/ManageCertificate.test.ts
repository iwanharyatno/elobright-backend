import { ManageCertificate } from '../../../../src/use-cases/certification/ManageCertificate';
import { ICertificationScoreRepository } from '../../../../src/domain/repositories/ICertificationScoreRepository';
import { ICertificationAdditionalScoreRepository } from '../../../../src/domain/repositories/ICertificationAdditionalScoreRepository';
import { IUserRepository } from '../../../../src/domain/repositories/IUserRepository';
import { IExamSubmissionRepository } from '../../../../src/domain/repositories/IExamSubmissionRepository';
import { IExamSectionSubmissionRepository } from '../../../../src/domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../../../src/domain/repositories/IExamSectionRepository';
import { IQuestionRepository } from '../../../../src/domain/repositories/IQuestionRepository';
import { IExamRepository } from '../../../../src/domain/repositories/IExamRepository';
import { IEmailService } from '../../../../src/domain/repositories/IEmailService';

describe('ManageCertificate Use Case', () => {
    let manageCertificate: ManageCertificate;
    let mockCertScoreRepo: jest.Mocked<ICertificationScoreRepository>;
    let mockAdditionalScoreRepo: jest.Mocked<ICertificationAdditionalScoreRepository>;
    let mockUserRepo: jest.Mocked<IUserRepository>;
    let mockSubmissionRepo: jest.Mocked<IExamSubmissionRepository>;
    let mockSectionSubmissionRepo: jest.Mocked<IExamSectionSubmissionRepository>;
    let mockSectionRepo: jest.Mocked<IExamSectionRepository>;
    let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
    let mockExamRepo: jest.Mocked<IExamRepository>;
    let mockEmailService: jest.Mocked<IEmailService>;

    const certScore = {
        id: 'cert-1',
        userId: 1,
        examSubmissionId: 'sub-1',
        additionalScore: { class_speaking_score: 95 },
        examScoreOverride: 88,
    };
    const user = {
        id: 1,
        email: 'user@example.com',
        fullName: 'John Doe',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        mockCertScoreRepo = {
            createForSubmission: jest.fn(),
            findById: jest.fn(),
            findByExamSubmissionId: jest.fn(),
            findAll: jest.fn(),
            updateAdditionalScore: jest.fn(),
            updateExamScoreOverride: jest.fn()
        } as unknown as jest.Mocked<ICertificationScoreRepository>;
        mockAdditionalScoreRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<ICertificationAdditionalScoreRepository>;
        mockUserRepo = {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            updateVerificationCode: jest.fn(),
            markEmailVerified: jest.fn()
        } as unknown as jest.Mocked<IUserRepository>;
        mockSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findByUserAndExam: jest.fn(),
            findByUserId: jest.fn(),
            findAllWithDetails: jest.fn()
        } as unknown as jest.Mocked<IExamSubmissionRepository>;
        mockSectionSubmissionRepo = {
            create: jest.fn(),
            update: jest.fn(),
            findById: jest.fn(),
            findBySubmissionId: jest.fn(),
            findBySubmissionAndSection: jest.fn(),
            findLatestBySubmissionId: jest.fn(),
            incrementTotalScore: jest.fn()
        } as unknown as jest.Mocked<IExamSectionSubmissionRepository>;
        mockSectionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findByExamId: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn()
        } as unknown as jest.Mocked<IExamSectionRepository>;
        mockQuestionRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findBySectionId: jest.fn(),
            findByIds: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            reorder: jest.fn(),
            getMaxOrderIndex: jest.fn()
        } as unknown as jest.Mocked<IQuestionRepository>;
        mockExamRepo = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn()
        } as unknown as jest.Mocked<IExamRepository>;
        mockEmailService = {
            sendVerificationCode: jest.fn(),
            sendCertificateEmail: jest.fn()
        } as unknown as jest.Mocked<IEmailService>;

        manageCertificate = new ManageCertificate(
            mockCertScoreRepo,
            mockAdditionalScoreRepo,
            mockUserRepo,
            mockSubmissionRepo,
            mockSectionSubmissionRepo,
            mockSectionRepo,
            mockQuestionRepo,
            mockExamRepo,
            mockEmailService
        );
    });

    describe('getPdf', () => {
        it('should generate a PDF buffer with the user identity', async () => {
            mockCertScoreRepo.findById.mockResolvedValue(certScore as any);
            mockUserRepo.findById.mockResolvedValue(user as any);
            mockSubmissionRepo.findById.mockResolvedValue({ id: 'sub-1', examId: 'exam-1' } as any);
            mockExamRepo.findById.mockResolvedValue({ id: 'exam-1', title: 'TOEFL Practice Exam 1' } as any);
            mockAdditionalScoreRepo.findAll.mockResolvedValue([
                { id: 'as-1', scoreName: 'class_speaking_score', weight: 0.3 },
            ]);
            // override exists -> no section/question queries
            mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([]);

            const result = await manageCertificate.getPdf('cert-1');

            expect(mockCertScoreRepo.findById).toHaveBeenCalledWith('cert-1');
            expect(mockSectionSubmissionRepo.findBySubmissionId).not.toHaveBeenCalled();
            expect(result.fullName).toBe('John Doe');
            expect(result.email).toBe('user@example.com');
            expect(Buffer.isBuffer(result.buffer)).toBe(true);
            expect(result.buffer.length).toBeGreaterThan(1000);
        });

        it('should compute the fallback exam score from section submissions when no override', async () => {
            mockCertScoreRepo.findById.mockResolvedValue({ ...certScore, examScoreOverride: null } as any);
            mockUserRepo.findById.mockResolvedValue(user as any);
            mockSubmissionRepo.findById.mockResolvedValue({ id: 'sub-1', examId: 'exam-1' } as any);
            mockExamRepo.findById.mockResolvedValue({ id: 'exam-1', title: 'TOEFL Practice Exam 1' } as any);
            mockSectionSubmissionRepo.findBySubmissionId.mockResolvedValue([
                { id: 'ss-1', submissionId: 'sub-1', examSectionId: 'section-1', totalScore: 18 },
                { id: 'ss-2', submissionId: 'sub-1', examSectionId: 'section-2', totalScore: 9 },
            ] as any);
            mockSectionRepo.findById.mockImplementation(async (id) => ({ id, examId: 'exam-1' } as any));
            mockQuestionRepo.findBySectionId.mockImplementation(async (sectionId) =>
                sectionId === 'section-1'
                    ? ([{ id: 'q1', sectionId, points: 5 }, { id: 'q2', sectionId, points: 5 }, { id: 'q3', sectionId, points: 5 }] as any)
                    : ([{ id: 'q4', sectionId, points: 3 }, { id: 'q5', sectionId, points: 3 }, { id: 'q6', sectionId, points: 3 }] as any)
            );
            mockAdditionalScoreRepo.findAll.mockResolvedValue([
                { id: 'as-1', scoreName: 'class_speaking_score', weight: 0.3 },
            ]);

            const result = await manageCertificate.getPdf('cert-1');

            expect(mockSectionSubmissionRepo.findBySubmissionId).toHaveBeenCalledWith('sub-1');
            // examScore = 27 / 24 * 100 = 112.5; examWeight = 0.7; final = 78.75 + 95*0.3 = 107.25
            expect(result.buffer.length).toBeGreaterThan(1000);
        });

        it('should throw when the certification score is not found', async () => {
            mockCertScoreRepo.findById.mockResolvedValue(null);

            await expect(manageCertificate.getPdf('missing')).rejects.toThrow('Certification score not found');
        });
    });

    describe('emailBySubmission', () => {
        it('should send the certificate email with the download link and identity', async () => {
            mockCertScoreRepo.findByExamSubmissionId.mockResolvedValue(certScore as any);
            mockUserRepo.findById.mockResolvedValue(user as any);

            const result = await manageCertificate.emailBySubmission('sub-1', 'http://localhost:3000');

            expect(mockEmailService.sendCertificateEmail).toHaveBeenCalledWith(
                'user@example.com',
                'John Doe',
                'user@example.com',
                'http://localhost:3000/api/certification-scores/cert-1/download'
            );
            expect(result).toEqual({
                to: 'user@example.com',
                fullName: 'John Doe',
                downloadUrl: 'http://localhost:3000/api/certification-scores/cert-1/download',
            });
        });

        it('should strip trailing slashes from the base url', async () => {
            mockCertScoreRepo.findByExamSubmissionId.mockResolvedValue(certScore as any);
            mockUserRepo.findById.mockResolvedValue(user as any);

            await manageCertificate.emailBySubmission('sub-1', 'http://localhost:3000///');

            expect(mockEmailService.sendCertificateEmail).toHaveBeenCalledWith(
                'user@example.com',
                'John Doe',
                'user@example.com',
                'http://localhost:3000/api/certification-scores/cert-1/download'
            );
        });

        it('should throw when there is no certification score for the submission', async () => {
            mockCertScoreRepo.findByExamSubmissionId.mockResolvedValue(null);

            await expect(manageCertificate.emailBySubmission('missing', 'http://localhost:3000'))
                .rejects.toThrow('Certification score not found');
        });

        it('should fall back to the email when the user has no full name', async () => {
            mockCertScoreRepo.findByExamSubmissionId.mockResolvedValue(certScore as any);
            mockUserRepo.findById.mockResolvedValue({ ...user, fullName: null } as any);

            const result = await manageCertificate.emailBySubmission('sub-1', 'http://localhost:3000');

            expect(mockEmailService.sendCertificateEmail).toHaveBeenCalledWith(
                'user@example.com',
                'user@example.com',
                'user@example.com',
                expect.stringContaining('/api/certification-scores/cert-1/download')
            );
            expect(result.fullName).toBe('user@example.com');
        });
    });
});