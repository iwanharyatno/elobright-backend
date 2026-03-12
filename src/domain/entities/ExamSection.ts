export interface ExamSection {
    id: string;
    examId: string;
    title: string | null;
    instructions: string | null;
    orderIndex: number | null;
}
