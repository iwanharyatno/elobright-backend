export interface User {
    id: number;
    email: string;
    passwordHash: string;
    fullName?: string | null;
    role?: 'superadmin' | 'admin' | 'reviewer' | 'moderator' | 'user' | null;
    phoneNumber?: string | null;
    isVerified?: boolean;
    verificationCode?: string | null;
    verificationCodeExpiresAt?: Date | null;
    resetPasswordToken?: string | null;
    resetPasswordExpiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
