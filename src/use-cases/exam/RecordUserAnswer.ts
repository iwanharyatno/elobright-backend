import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';
import { UserAnswer } from '../../domain/entities/UserAnswer';

export class RecordUserAnswer {
    constructor(
        private userAnswerRepository: IUserAnswerRepository,
        private submissionRepository: IExamSubmissionRepository,
        private examRepository: IExamRepository,
        private optionRepository: IQuestionOptionRepository
    ) { }

    async execute(
        submissionId: string,
        questionId: string,
        selectedOptionId?: string,
        textResponse?: string,
        audioFile?: Express.Multer.File
    ): Promise<UserAnswer> {
        // 1. Fetch submission and calculate duration limit
        const submission = await this.submissionRepository.findById(submissionId);
        if (!submission) throw new Error('Submission not found');
        if (submission.status !== 'ongoing') throw new Error('Exam is not currently ongoing');
        if (!submission.startedAt) throw new Error('Exam start time is missing');

        const exam = await this.examRepository.findById(submission.examId);
        if (!exam || !exam.durationMinutes) throw new Error('Exam details or duration missing');

        const startTime = new Date(submission.startedAt);
        const limitTime = new Date(startTime.getTime() + exam.durationMinutes * 60000);

        if (new Date() > limitTime) {
            throw new Error('Time window exceeded'); // Treat as Bad Request later
        }

        // 2. Prepare audio URL
        let audioResponseUrl: string | null = null;
        if (audioFile) {
            audioResponseUrl = `/uploads/${audioFile.filename}`;
        }

        // 3. Handle scoring for MCQ
        if (selectedOptionId) {
            const selectedOption = await this.optionRepository.findById(selectedOptionId);
            if (selectedOption && selectedOption.isCorrect) {
                await this.submissionRepository.incrementTotalScore(submissionId, 1);
            }
        }

        // 4. Record answer
        return this.userAnswerRepository.create({
            submissionId,
            questionId,
            selectedOptionId: selectedOptionId || null,
            textResponse: textResponse || null,
            audioResponseUrl
        });
    }
}
