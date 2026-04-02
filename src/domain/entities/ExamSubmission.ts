export interface ExamSubmission {
    id: string;
    userId: number;
    examId: string;
    status: string | null;
    totalScore: number | null;
    timezone: string | null;
    startedAt: Date | null;
    endTimeLimit: Date | null;
    submittedAt: Date | null;
}
