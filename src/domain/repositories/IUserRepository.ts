import { User } from '../entities/User';

export interface IUserRepository {
    findById(id: number): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findAll(): Promise<User[]>;
    create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
    updateVerificationCode(userId: number, code: string, expiresAt: Date): Promise<User | null>;
    markEmailVerified(userId: number): Promise<User | null>;
    updateResetPasswordToken(userId: number, tokenHash: string, expiresAt: Date): Promise<User | null>;
    findByResetPasswordToken(tokenHash: string): Promise<User | null>;
    updatePassword(userId: number, passwordHash: string): Promise<User | null>;
}