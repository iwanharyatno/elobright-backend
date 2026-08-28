import { User } from '../entities/User';

export interface IUserRepository {
    findById(id: number): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findAll(): Promise<User[]>;
    findAllWithFilters(filters: { search?: string; startDate?: Date; endDate?: Date; isVerified?: boolean; page?: number; limit?: number }): Promise<{ users: User[]; total: number }>;
    create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
    updateVerificationCode(userId: number, code: string, expiresAt: Date): Promise<User | null>;
    markEmailVerified(userId: number): Promise<User | null>;
    setVerified(userId: number, isVerified: boolean): Promise<User | null>;
    updateResetPasswordToken(userId: number, tokenHash: string, expiresAt: Date): Promise<User | null>;
    findByResetPasswordToken(tokenHash: string): Promise<User | null>;
    updatePassword(userId: number, passwordHash: string): Promise<User | null>;
}