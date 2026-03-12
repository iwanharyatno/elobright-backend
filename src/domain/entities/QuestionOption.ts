export interface QuestionOption {
    id: string;
    questionId: string;
    optionText: string | null;
    isCorrect: boolean | null;
}
