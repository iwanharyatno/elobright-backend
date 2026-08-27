import { User } from './User';
import { Exam } from './Exam';
import { Student } from './Student';

export interface CertificationScore {
    id: string;
    userId: number;
    examSubmissionId: string;
    additionalScore: Record<string, number> | null;
    examScoreOverride?: Record<string, number> | null;
}

export interface CertificationSectionScore {
    sectionId: string;
    sectionName: string | null;
    correctPoints: number;
    fullPoints: number;
    scaledScore: number;
}

export interface CertificationSectionOverride {
    sectionId: string;
    sectionName: string | null;
    overriddenScore: number;
}

export interface CertificationScoreWithUser extends CertificationScore {
    user?: Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'phoneNumber'>;
    originalExamScore?: number;
    totalScore?: number;
    exam?: Exam;
    student?: Student;
    scores?: CertificationSectionScore[];
    overrides?: CertificationSectionOverride[];
    groupNumber?: string | null;
    degreeProgram?: string | null;
}