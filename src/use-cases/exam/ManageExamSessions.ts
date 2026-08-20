import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { ExamSubmission } from '../../domain/entities/ExamSubmission';
import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';
import { IExamSectionRepository } from '../../domain/repositories/IExamSectionRepository';
import { ICertificationScoreRepository } from '../../domain/repositories/ICertificationScoreRepository';
import { ExamSectionSubmission } from '../../domain/entities/ExamSectionSubmission';

export class ManageExamSessions {
    constructor(
        private submissionRepository: IExamSubmissionRepository,
        private examRepository: IExamRepository,
        private userAnswerRepository: IUserAnswerRepository,
        private questionRepository: IQuestionRepository,
        private sectionSubmissionRepository: IExamSectionSubmissionRepository,
        private sectionRepository: IExamSectionRepository,
        private certificationScoreRepository: ICertificationScoreRepository
    ) { }

    async startExam(userId: number, examId: string, timezone?: string): Promise<ExamSubmission & { currentSectionSession: ExamSectionSubmission }> {
        const exam = await this.examRepository.findById(examId);
        if (!exam) {
            throw new Error('Exam not found');
        }

        const existingSubmissions = await this.submissionRepository.findByUserAndExam(userId, examId);
        const ongoingSession = existingSubmissions.find(s => s.status === 'ongoing');
        if (ongoingSession) {
            const error = new Error('Ongoing session already exists') as any;

            // Retrieve the latest examSectionSubmission
            let latestSectionSession = await this.sectionSubmissionRepository.findLatestBySubmissionId(ongoingSession.id);

            // If no section session exists yet, auto-create one for the first section
            if (!latestSectionSession) {
                const sections = await this.sectionRepository.findByExamId(examId);
                if (sections.length === 0) {
                    throw new Error('Exam has no sections');
                }
                const firstSection = sections[0];

                latestSectionSession = await this.sectionSubmissionRepository.create({
                    submissionId: ongoingSession.id,
                    examSectionId: firstSection.id,
                    status: 'ongoing',
                    totalScore: 0,
                    timezone: timezone || null,
                    startedAt: new Date(),
                    endTimeLimit: new Date(Date.now() + (firstSection.durationMinutes || 0) * 60000),
                    submittedAt: null
                });
            }

            error.session = {
                ...ongoingSession,
                currentSectionSession: latestSectionSession
            };

            const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(ongoingSession.id);
            for (const ss of sectionSubmissions) {
                const existingAnswers = await this.userAnswerRepository.findBySectionSubmissionId(ss.id);
                if (existingAnswers.length > 0) {
                    const latestAnswer = existingAnswers[existingAnswers.length - 1];
                    const question = await this.questionRepository.findById(latestAnswer.questionId);

                    if (question) {
                        error.last_progress = {
                            sectionId: question.sectionId,
                            questionId: latestAnswer.questionId,
                            selectedOptionId: latestAnswer.selectedOptionId
                        };
                        break;
                    }
                }
            }

            throw error;
        }

        const startedAt = new Date();

        const submission = await this.submissionRepository.create({
            userId,
            examId,
            status: 'ongoing',
            timezone: timezone || null,
            startedAt,
            submittedAt: null
        });

        // Fetch first section
        const sections = await this.sectionRepository.findByExamId(examId);
        if (sections.length === 0) {
            throw new Error('Exam has no sections');
        }
        const firstSection = sections[0];

        const sectionSubmission = await this.sectionSubmissionRepository.create({
            submissionId: submission.id,
            examSectionId: firstSection.id,
            status: 'ongoing',
            totalScore: 0,
            timezone: timezone || null,
            startedAt: new Date(),
            endTimeLimit: new Date(Date.now() + (firstSection.durationMinutes || 0) * 60000),
            submittedAt: null
        });

        return {
            ...submission,
            currentSectionSession: sectionSubmission
        };
    }

    async startSection(submissionId: string, examSectionId: string, timezone?: string): Promise<ExamSectionSubmission> {
        const section = await this.sectionRepository.findById(examSectionId);
        if (!section) throw new Error('Section not found');

        const startedAt = new Date();
        const endTimeLimit = new Date(startedAt.getTime() + section.durationMinutes * 60000);

        return this.sectionSubmissionRepository.create({
            submissionId,
            examSectionId,
            status: 'ongoing',
            totalScore: 0,
            timezone: timezone || null,
            startedAt,
            endTimeLimit,
            submittedAt: null
        });
    }

    async finishSection(sectionSubmissionId: string, timezone?: string): Promise<ExamSectionSubmission | null> {
        const submission = await this.sectionSubmissionRepository.findById(sectionSubmissionId);
        if (!submission) throw Error('Exam section session not found');

        const now = new Date();
        const isLate = submission.endTimeLimit && now > submission.endTimeLimit;
        const status = isLate ? 'finished-late' : 'finished';

        // 1. Finish current section
        await this.sectionSubmissionRepository.update(sectionSubmissionId, {
            status,
            ...(timezone && { timezone }),
            submittedAt: now
        });

        // 2. Find and create next section submission if available
        const currentSection = await this.sectionRepository.findById(submission.examSectionId);
        if (!currentSection) return null;

        const allSections = await this.sectionRepository.findByExamId(currentSection.examId);
        const currentIndex = allSections.findIndex(s => s.id === currentSection.id);

        if (currentIndex !== -1 && currentIndex < allSections.length - 1) {
            const nextSection = allSections[currentIndex + 1];

            const existingNextSubmission = await this.sectionSubmissionRepository.findBySubmissionAndSection(submission.submissionId, nextSection.id);
            if (existingNextSubmission.length > 0) {
                return existingNextSubmission[0];
            }

            return this.sectionSubmissionRepository.create({
                submissionId: submission.submissionId,
                examSectionId: nextSection.id,
                status: 'ongoing',
                totalScore: 0,
                timezone: timezone || null,
                startedAt: new Date(),
                endTimeLimit: new Date(Date.now() + (nextSection.durationMinutes || 0) * 60000),
                submittedAt: null
            });
        }

        return null;
    }

    async finishExam(submissionId: string, timezone?: string): Promise<{ submission: ExamSubmission | null, sectionSubmissions: ExamSectionSubmission[] }> {
        const submission = await this.submissionRepository.findById(submissionId);
        if (!submission) return { submission: null, sectionSubmissions: [] };

        const sectionSubmissions = await this.sectionSubmissionRepository.findBySubmissionId(submissionId);
        const augmentedSections = await Promise.all(sectionSubmissions.map(async (ss) => {
            const section = await this.sectionRepository.findById(ss.examSectionId);
            const questions = await this.questionRepository.findBySectionId(ss.examSectionId);
            const allScore = questions.reduce((sum, q) => sum + (q.points || 0), 0);
            return { ...ss, allScore, section: section || undefined };
        }));

        if (submission.status === 'submitted' || submission.status === 'finished-late') {
            await this.certificationScoreRepository.createForSubmission(submission.userId, submissionId);
            return { submission, sectionSubmissions: augmentedSections };
        }

        const now = new Date();
        const latestSection = await this.sectionSubmissionRepository.findLatestBySubmissionId(submissionId);
        const isLate = latestSection && latestSection.endTimeLimit && now > latestSection.endTimeLimit;
        const status = isLate ? 'finished-late' : 'submitted';

        const updatedSubmission = await this.submissionRepository.update(submissionId, {
            status,
            ...(timezone && { timezone }),
            submittedAt: now
        });

        await this.certificationScoreRepository.createForSubmission(submission.userId, submissionId);

        return { submission: updatedSubmission, sectionSubmissions: augmentedSections };
    }

    async getSubmissionHistoryByUserId(userId: number): Promise<ExamSubmission[]> {
        return this.submissionRepository.findByUserId(userId);
    }
}
