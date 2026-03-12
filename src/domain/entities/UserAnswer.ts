export interface UserAnswer {
    id: string;
    submissionId: string;
    questionId: string;
    selectedOptionId: string | null;
    textResponse: string | null;
    audioResponseUrl: string | null;
}
