export interface UserAnswer {
    id: string;
    sectionSubmissionId: string;
    questionId: string;
    selectedOptionId: string | null;
    textResponse: string | null;
    audioResponseUrl: string | null;
}
