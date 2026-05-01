import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IStudentRepository } from '../../domain/repositories/IStudentRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';

export interface QuestionAnswer {
    questionId: string;
    questionText: string;
    questionType: string | null;
    sectionTitle: string | null;
    selectedOptionId: string | null;
    selectedOptionText: string | null;
    isCorrect: boolean | null;
    textResponse: string | null;
    audioResponseUrl: string | null;
    points: number | null;
}

export interface ExamReportEntry {
    examId: string;
    examTitle: string | null;
    examType: string | null;
    submissionId: string;
    status: string | null;
    totalScore: number;
    maxScore: number;
    submittedAt: Date | null;
    answers: QuestionAnswer[];
}

export interface UserReport {
    nama: string | null;
    nim: string | null;
    email: string;
    nomorHp: string | null;
    exams: ExamReportEntry[];
}

export class GetExamReport {
    constructor(
        private userRepository: IUserRepository,
        private studentRepository: IStudentRepository,
        private submissionRepository: IExamSubmissionRepository,
        private userAnswerRepository: IUserAnswerRepository,
        private questionRepository: IQuestionRepository,
        private optionRepository: IQuestionOptionRepository,
    ) {}

    async execute(): Promise<UserReport[]> {
        const users = await this.userRepository.findAll();
        const students = await this.studentRepository.findAll();
        const studentByUserId = new Map(students.map(s => [s.userId, s]));

        const allSubmissions = await this.submissionRepository.findAllWithDetails();
        const submissionsByUserId = new Map<number, typeof allSubmissions>();
        for (const sub of allSubmissions) {
            const list = submissionsByUserId.get(sub.userId) || [];
            list.push(sub);
            submissionsByUserId.set(sub.userId, list);
        }

        const allSectionSubmissionIds = allSubmissions.flatMap(s =>
            (s.examSectionSubmissions || []).map(ss => ss.id)
        );

        const allAnswers = allSectionSubmissionIds.length > 0
            ? await this.userAnswerRepository.findBySectionSubmissionIds(allSectionSubmissionIds)
            : [];

        const answersBySectionSubmissionId = new Map<string, typeof allAnswers>();
        for (const ans of allAnswers) {
            const list = answersBySectionSubmissionId.get(ans.sectionSubmissionId) || [];
            list.push(ans);
            answersBySectionSubmissionId.set(ans.sectionSubmissionId, list);
        }

        const allQuestionIds = [...new Set(allAnswers.map(a => a.questionId))];
        const allQuestions = allQuestionIds.length > 0
            ? await this.questionRepository.findByIds(allQuestionIds)
            : [];
        const questionMap = new Map(allQuestions.map(q => [q.id, q]));

        const mcqQuestionIds = allQuestions.filter(q => q.questionType === 'mcq').map(q => q.id);
        const allOptions = mcqQuestionIds.length > 0
            ? await this.optionRepository.findByQuestionIds(mcqQuestionIds)
            : [];
        const optionsByQuestionId = new Map<string, typeof allOptions>();
        for (const opt of allOptions) {
            const list = optionsByQuestionId.get(opt.questionId) || [];
            list.push(opt);
            optionsByQuestionId.set(opt.questionId, [...list]);
        }

        const selectedOptionIds = [...new Set(allAnswers.map(a => a.selectedOptionId).filter(Boolean))] as string[];
        const selectedOptions = selectedOptionIds.length > 0
            ? await this.optionRepository.findByIds(selectedOptionIds)
            : [];
        const optionById = new Map(selectedOptions.map(o => [o.id, o]));

        const sectionQuestionsMap = new Map<string, typeof allQuestions>();
        for (const q of allQuestions) {
            const list = sectionQuestionsMap.get(q.sectionId) || [];
            list.push(q);
            sectionQuestionsMap.set(q.sectionId, [...list]);
        }

        const reports: UserReport[] = users.map(user => {
            const student = studentByUserId.get(user.id);
            const userSubmissions = submissionsByUserId.get(user.id) || [];

            const exams: ExamReportEntry[] = userSubmissions.map(submission => {
                const sectionSubmissions = submission.examSectionSubmissions || [];

                const totalScore = sectionSubmissions.reduce(
                    (sum, ss) => sum + (ss.totalScore || 0), 0
                );

                let maxScore = 0;
                const answers: QuestionAnswer[] = [];

                for (const ss of sectionSubmissions) {
                    const sectionQuestions = sectionQuestionsMap.get(ss.examSectionId) || [];
                    maxScore += sectionQuestions.reduce((s, q) => s + (q.points || 0), 0);

                    const sectionAnswers = answersBySectionSubmissionId.get(ss.id) || [];
                    for (const ans of sectionAnswers) {
                        const question = questionMap.get(ans.questionId);
                        if (!question) continue;

                        let selectedOptionText: string | null = null;
                        let isCorrect: boolean | null = null;

                        if (ans.selectedOptionId) {
                            const selectedOpt = optionById.get(ans.selectedOptionId);
                            if (selectedOpt) {
                                selectedOptionText = selectedOpt.optionText;
                                isCorrect = selectedOpt.isCorrect;
                            }
                        }

                        answers.push({
                            questionId: question.id,
                            questionText: question.questionText,
                            questionType: question.questionType,
                            sectionTitle: ss.section?.title || null,
                            selectedOptionId: ans.selectedOptionId,
                            selectedOptionText,
                            isCorrect,
                            textResponse: ans.textResponse,
                            audioResponseUrl: ans.audioResponseUrl,
                            points: question.points,
                        });
                    }
                }

                return {
                    examId: submission.examId,
                    examTitle: submission.exam?.title || null,
                    examType: submission.exam?.type || null,
                    submissionId: submission.id,
                    status: submission.status,
                    totalScore,
                    maxScore,
                    submittedAt: submission.submittedAt,
                    answers,
                };
            });

            return {
                nama: user.fullName || null,
                nim: student?.studentId || null,
                email: user.email,
                nomorHp: user.phoneNumber || null,
                exams,
            };
        });

        return reports;
    }
}
