import { Exam } from './Exam';
import { ExamSectionSubmission } from './ExamSectionSubmission';

export interface ExamSubmission {
    id: string;
    userId: number;
    examId: string;
    groupNumber?: string | null;
    status: string | null;
    timezone: string | null;
    startedAt: Date | null;
    submittedAt: Date | null;
    exam?: Exam;
    examSectionSubmissions?: ExamSectionSubmission[];
}
