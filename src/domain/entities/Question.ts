export interface Question {
    id: string;
    sectionId: string;
    audioUrl: string | null;
    questionAudioUrl: string | null;
    imageUrl: string | null;
    narrativeText: string | null;
    questionText: string;
    questionType: string | null;
    points: number | null;
    orderIndex: number | null;
    isActive: boolean;
}
