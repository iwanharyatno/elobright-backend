import { IUserAnswerRepository } from '../../domain/repositories/IUserAnswerRepository';
import { IExamSubmissionRepository } from '../../domain/repositories/IExamSubmissionRepository';
import { IExamRepository } from '../../domain/repositories/IExamRepository';
import { IQuestionOptionRepository } from '../../domain/repositories/IQuestionOptionRepository';
import { UserAnswer } from '../../domain/entities/UserAnswer';
import { IQuestionRepository } from '../../domain/repositories/IQuestionRepository';
import { IExamSectionSubmissionRepository } from '../../domain/repositories/IExamSectionSubmissionRepository';

export class RecordUserAnswer {
    constructor(
        private userAnswerRepository: IUserAnswerRepository,
        private sectionSubmissionRepository: IExamSectionSubmissionRepository,
        private optionRepository: IQuestionOptionRepository,
        private questionRepository: IQuestionRepository
    ) { }

    async execute(
        sectionSubmissionId: string,
        questionId: string,
        selectedOptionId?: string,
        textResponse?: string,
        audioFile?: Express.Multer.File
    ): Promise<UserAnswer> {
        // 1. Fetch section submission and validate timing
        const sectionSubmission = await this.sectionSubmissionRepository.findById(sectionSubmissionId);
        if (!sectionSubmission) throw new Error('Section submission not found');
        if (sectionSubmission.status !== 'ongoing') throw new Error('Section is not currently ongoing');
        if (!sectionSubmission.startedAt) throw new Error('Section start time is missing');

        const question = await this.questionRepository.findById(questionId);
        if (!question) throw new Error('Question not found');

        if (question.sectionId !== sectionSubmission.examSectionId) {
            throw new Error('Question does not belong to this section');
        }

        if (sectionSubmission.endTimeLimit && new Date() > sectionSubmission.endTimeLimit) {
            throw new Error('Time window exceeded');
        }

        // 2. Prepare audio URL
        let audioResponseUrl: string | null = null;
        if (audioFile) {
            audioResponseUrl = `/uploads/${audioFile.filename}`;
        }

        // 3. Handle scoring for MCQ with Upsert
        const existingAnswer = await this.userAnswerRepository.findBySectionSubmissionAndQuestion(sectionSubmissionId, questionId);

        let wasCorrect = false;
        if (existingAnswer?.selectedOptionId) {
            const oldOption = await this.optionRepository.findById(existingAnswer.selectedOptionId);
            wasCorrect = oldOption?.isCorrect || false;
        }

        let isCorrectNow = false;
        if (selectedOptionId) {
            const newOption = await this.optionRepository.findById(selectedOptionId);
            isCorrectNow = newOption?.isCorrect || false;
        }

        let scoreDelta = 0;
        if (!wasCorrect && isCorrectNow) {
            scoreDelta = question.points || 1;
        } else if (wasCorrect && !isCorrectNow) {
            scoreDelta = -(question.points || 1);
        }

        if (scoreDelta !== 0) {
            await this.sectionSubmissionRepository.incrementTotalScore(sectionSubmissionId, scoreDelta);
        }

        // 4. Record or update answer
        if (existingAnswer) {
            return this.userAnswerRepository.update(existingAnswer.id, {
                selectedOptionId: selectedOptionId || null,
                textResponse: textResponse || null,
                ...(audioResponseUrl && { audioResponseUrl })
            });
        }

        return this.userAnswerRepository.create({
            sectionSubmissionId,
            questionId,
            selectedOptionId: selectedOptionId || null,
            textResponse: textResponse || null,
            audioResponseUrl
        });
    }
}
