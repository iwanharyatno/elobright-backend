import { User } from './User';

export interface CertificationScore {
    id: string;
    userId: number;
    examSubmissionId: string;
    additionalScore: Record<string, number> | null;
    examScoreOverride?: number | null;
}

export interface CertificationScoreWithUser extends CertificationScore {
    user?: Omit<User, 'passwordHash' | 'verificationCode'>;
}