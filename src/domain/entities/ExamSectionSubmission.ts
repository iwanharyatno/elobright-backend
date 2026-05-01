import { ExamSection } from './ExamSection';

export interface ExamSectionSubmission {
    id: string;
    submissionId: string;
    examSectionId: string;
    status: string | null;
    totalScore: number | null;
    timezone: string | null;
    startedAt: Date | null;
    endTimeLimit: Date | null;
    submittedAt: Date | null;
    allScore?: number; // Dynamic field for max score of section or similar
    section?: ExamSection;
}
