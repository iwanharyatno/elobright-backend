export interface ExamSubmission {
    id: string;
    userId: number;
    examId: string;
    status: string | null;
    totalScore: number | null;
    startedAt: Date | null;
    submittedAt: Date | null;
}
