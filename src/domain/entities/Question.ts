export interface Question {
    id: string;
    sectionId: string;
    audioUrl: string | null;
    imageUrl: string | null;
    narrativeText: string | null;
    questionText: string;
    questionType: string | null;
    points: number | null;
}
